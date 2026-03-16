"""
Margin and pricing calculation service.
"""
import math
from typing import Optional


def parse_spanish_number(value: str) -> Optional[float]:
    """Convert Spanish number format '1.234,56' to float 1234.56."""
    if not value:
        return None
    value = value.strip().replace("€", "").replace("%", "").strip()
    # Spanish format: dots as thousands sep, comma as decimal
    if "," in value and "." in value:
        # e.g. "1.234,56"
        value = value.replace(".", "").replace(",", ".")
    elif "," in value:
        value = value.replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return None


def apply_cascading_discounts(
    precio_bruto: float,
    descuentos: list[Optional[float]],
) -> float:
    """Apply cascading discounts: cost = price * (1-d1/100) * (1-d2/100) * ...

    Args:
        precio_bruto: Gross unit price
        descuentos: List of discount percentages (0–100), None values are skipped
    Returns:
        Net cost after all discounts applied
    """
    cost = precio_bruto
    for d in descuentos:
        if d is not None and d > 0:
            cost *= 1 - (d / 100)
    return round(cost, 6)


def get_margin_for_cost(cost: float, tiers: list[dict]) -> float:
    """Find the applicable margin percentage for a given cost.

    Tiers should be sorted by min_cost. The first tier where cost <= max_cost applies.
    The last tier with max_cost=None is the catch-all.
    """
    sorted_tiers = sorted(tiers, key=lambda t: t.get("min_cost", 0))
    for tier in sorted_tiers:
        max_cost = tier.get("max_cost")
        if max_cost is None or cost <= max_cost:
            return float(tier["margin_pct"])
    # Fallback: use last tier
    if sorted_tiers:
        return float(sorted_tiers[-1]["margin_pct"])
    return 30.0  # safe default


def apply_rounding(
    value: float,
    rounding_mode: str,
    decimals: int = 2,
) -> float:
    """Apply rounding according to mode.

    Args:
        value: The raw price
        rounding_mode: "standard" or "psychological"
        decimals: Number of decimal places (for standard mode)
    Returns:
        Rounded price
    """
    if rounding_mode == "psychological":
        # Round to nearest integer - 0.01 (e.g. 4.99, 9.99, 14.99)
        floored = math.floor(value)
        return floored + 0.99 if floored >= 1 else max(0.01, round(value, 2))
    return round(value, decimals)


def calculate_pricing(
    coste_neto: float,
    margen_pct: float,
    iva_pct: float,
    rounding_mode: str = "standard",
    decimals: int = 2,
) -> dict:
    """Calculate PVP sin/con IVA from net cost and margin.

    PVP sin IVA = coste * (1 + margen/100)
    PVP con IVA = pvp_sin_iva * (1 + iva/100)

    Returns dict with pvp_sin_iva and pvp_con_iva.
    """
    if coste_neto <= 0:
        return {"pvp_sin_iva": 0.0, "pvp_con_iva": 0.0}

    pvp_sin_iva_raw = coste_neto * (1 + margen_pct / 100)
    pvp_con_iva_raw = pvp_sin_iva_raw * (1 + iva_pct / 100)

    pvp_con_iva = apply_rounding(pvp_con_iva_raw, rounding_mode, decimals)

    if rounding_mode == "psychological":
        # Back-calculate pvp_sin_iva from the rounded pvp_con_iva
        pvp_sin_iva = round(pvp_con_iva / (1 + iva_pct / 100), decimals)
    else:
        pvp_sin_iva = apply_rounding(pvp_sin_iva_raw, rounding_mode, decimals)

    return {"pvp_sin_iva": pvp_sin_iva, "pvp_con_iva": pvp_con_iva}


def compute_article_pricing(
    precio_bruto: float,
    cantidad: float,
    descuento_1: Optional[float],
    descuento_2: Optional[float],
    descuento_3: Optional[float],
    descuento_4: Optional[float],
    iva_pct: float,
    margen_pct_override: Optional[float],
    tiers: list[dict],
    rounding_mode: str = "standard",
    decimals: int = 2,
) -> dict:
    """Full pricing computation for one article.

    Returns dict with:
        coste_neto_unitario, coste_neto_total,
        margen_pct, margen_override,
        pvp_sin_iva, pvp_con_iva
    """
    discounts = [descuento_1, descuento_2, descuento_3, descuento_4]
    coste_neto_unitario = apply_cascading_discounts(precio_bruto, discounts)
    coste_neto_total = round(coste_neto_unitario * cantidad, 6)

    if margen_pct_override is not None:
        margen_pct = margen_pct_override
        margen_override = True
    else:
        margen_pct = get_margin_for_cost(coste_neto_unitario, tiers)
        margen_override = False

    pricing = calculate_pricing(coste_neto_unitario, margen_pct, iva_pct, rounding_mode, decimals)

    return {
        "coste_neto_unitario": round(coste_neto_unitario, 4),
        "coste_neto_total": round(coste_neto_total, 4),
        "margen_pct": margen_pct,
        "margen_override": margen_override,
        "pvp_sin_iva": pricing["pvp_sin_iva"],
        "pvp_con_iva": pricing["pvp_con_iva"],
    }
