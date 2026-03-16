"""Tests for margin calculation service."""
import pytest
from app.services.margin_service import (
    apply_cascading_discounts,
    get_margin_for_cost,
    calculate_pricing,
    compute_article_pricing,
)

DEFAULT_TIERS = [
    {"min_cost": 0, "max_cost": 1.00, "margin_pct": 200},
    {"min_cost": 1.01, "max_cost": 5.00, "margin_pct": 120},
    {"min_cost": 5.01, "max_cost": 20.00, "margin_pct": 70},
    {"min_cost": 20.01, "max_cost": 80.00, "margin_pct": 45},
    {"min_cost": 80.01, "max_cost": 200.00, "margin_pct": 30},
    {"min_cost": 200.01, "max_cost": None, "margin_pct": 20},
]


class TestCascadingDiscounts:
    def test_no_discounts(self):
        result = apply_cascading_discounts(100.0, [None, None, None, None])
        assert abs(result - 100.0) < 0.001

    def test_single_discount_30pct(self):
        result = apply_cascading_discounts(100.0, [30, None, None, None])
        assert abs(result - 70.0) < 0.001

    def test_two_discounts_30_10(self):
        # 100 * (1-0.30) * (1-0.10) = 100 * 0.70 * 0.90 = 63.0
        result = apply_cascading_discounts(100.0, [30, 10, None, None])
        assert abs(result - 63.0) < 0.001

    def test_three_discounts_30_10_5(self):
        # 100 * 0.70 * 0.90 * 0.95 = 59.85
        result = apply_cascading_discounts(100.0, [30, 10, 5, None])
        assert abs(result - 59.85) < 0.01

    def test_zero_discount_skipped(self):
        result = apply_cascading_discounts(50.0, [0, 0, 0, 0])
        assert abs(result - 50.0) < 0.001

    def test_real_world_example(self):
        # Price 12.50, discounts 30% + 10%
        result = apply_cascading_discounts(12.50, [30, 10, None, None])
        expected = 12.50 * 0.70 * 0.90
        assert abs(result - expected) < 0.001


class TestMarginTiers:
    def test_cost_below_1(self):
        assert get_margin_for_cost(0.50, DEFAULT_TIERS) == 200

    def test_cost_exactly_1(self):
        assert get_margin_for_cost(1.00, DEFAULT_TIERS) == 200

    def test_cost_1_01(self):
        assert get_margin_for_cost(1.01, DEFAULT_TIERS) == 120

    def test_cost_5(self):
        assert get_margin_for_cost(5.00, DEFAULT_TIERS) == 120

    def test_cost_10(self):
        assert get_margin_for_cost(10.0, DEFAULT_TIERS) == 70

    def test_cost_50(self):
        assert get_margin_for_cost(50.0, DEFAULT_TIERS) == 45

    def test_cost_100(self):
        assert get_margin_for_cost(100.0, DEFAULT_TIERS) == 30

    def test_cost_over_200(self):
        assert get_margin_for_cost(500.0, DEFAULT_TIERS) == 20


class TestPricing:
    def test_standard_rounding(self):
        result = calculate_pricing(
            coste_neto=10.0, margen_pct=70.0, iva_pct=21.0,
            rounding_mode="standard", decimals=2
        )
        # PVP sin IVA = 10 * 1.70 = 17.00
        # PVP con IVA = 17.00 * 1.21 = 20.57
        assert result["pvp_sin_iva"] == 17.00
        assert result["pvp_con_iva"] == 20.57

    def test_psychological_rounding(self):
        result = calculate_pricing(
            coste_neto=10.0, margen_pct=70.0, iva_pct=21.0,
            rounding_mode="psychological", decimals=2
        )
        # Raw PVP con IVA = 20.57 → psychological = 20.99
        assert result["pvp_con_iva"] == 20.99

    def test_zero_cost(self):
        result = calculate_pricing(
            coste_neto=0.0, margen_pct=70.0, iva_pct=21.0
        )
        assert result["pvp_sin_iva"] == 0.0
        assert result["pvp_con_iva"] == 0.0


class TestFullArticlePricing:
    def test_full_calculation(self):
        result = compute_article_pricing(
            precio_bruto=89.90,
            cantidad=2,
            descuento_1=20,
            descuento_2=5,
            descuento_3=None,
            descuento_4=None,
            iva_pct=21.0,
            margen_pct_override=None,
            tiers=DEFAULT_TIERS,
            rounding_mode="standard",
            decimals=2,
        )
        # 89.90 * 0.80 * 0.95 = 68.324
        assert abs(result["coste_neto_unitario"] - 68.324) < 0.01
        # coste 68.32 is in tier 20.01-80.00 → margin 45%
        assert result["margen_pct"] == 45
        assert result["margen_override"] is False
        assert result["pvp_con_iva"] > result["pvp_sin_iva"]

    def test_manual_margin_override(self):
        result = compute_article_pricing(
            precio_bruto=10.0,
            cantidad=1,
            descuento_1=None, descuento_2=None, descuento_3=None, descuento_4=None,
            iva_pct=21.0,
            margen_pct_override=99.0,
            tiers=DEFAULT_TIERS,
        )
        assert result["margen_pct"] == 99.0
        assert result["margen_override"] is True
