"""Tests for extraction service (with mocked Claude API)."""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.extraction_service import (
    normalize_extracted_articles,
    detect_supplier,
    build_extraction_prompt,
)


class TestNormalization:
    def test_valid_articles(self):
        raw = [
            {
                "linea": 1,
                "descripcion": "Tornillo M6x25 DIN 933",
                "cantidad": 5.0,
                "precio_unitario_bruto": 12.50,
                "descuento_1": 30,
                "descuento_2": 10,
                "descuento_3": None,
                "descuento_4": None,
                "coste_neto_unitario": None,
                "iva_pct": 21.0,
                "recargo_pct": None,
                "codigo_proveedor": "FER-001",
                "codigo_fabricante": "STL-4520",
                "ean": "8414702123456",
                "otros_codigos": {},
            }
        ]
        result = normalize_extracted_articles(raw)
        assert len(result) == 1
        art = result[0]
        assert art["descripcion"] == "Tornillo M6x25 DIN 933"
        assert art["cantidad"] == 5.0
        assert art["precio_unitario_bruto"] == 12.50
        assert art["descuento_1"] == 30
        assert art["ean"] == "8414702123456"
        assert art["codigo_principal"] == "8414702123456"  # EAN is priority

    def test_missing_description_skipped(self):
        raw = [{"linea": 1, "descripcion": "", "cantidad": 1}]
        result = normalize_extracted_articles(raw)
        assert len(result) == 0

    def test_none_description_skipped(self):
        raw = [{"linea": 1, "descripcion": None, "cantidad": 1}]
        result = normalize_extracted_articles(raw)
        assert len(result) == 0

    def test_invalid_numbers_handled(self):
        raw = [
            {
                "linea": 1,
                "descripcion": "Artículo test",
                "cantidad": "no_es_numero",
                "precio_unitario_bruto": "abc",
                "iva_pct": None,
                "descuento_1": None,
                "descuento_2": None,
                "descuento_3": None,
                "descuento_4": None,
            }
        ]
        result = normalize_extracted_articles(raw)
        assert len(result) == 1
        assert result[0]["cantidad"] == 1.0  # default
        assert result[0]["precio_unitario_bruto"] == 0.0  # default
        assert result[0]["iva_pct"] == 21.0  # default

    def test_codigo_principal_priority(self):
        # EAN > fabricante > proveedor
        raw = [
            {"linea": 1, "descripcion": "Test", "cantidad": 1,
             "precio_unitario_bruto": 5, "ean": "1234567890123",
             "codigo_fabricante": "FAB-001", "codigo_proveedor": "PROV-001",
             "descuento_1": None, "descuento_2": None, "descuento_3": None, "descuento_4": None},
        ]
        result = normalize_extracted_articles(raw)
        assert result[0]["codigo_principal"] == "1234567890123"

    def test_codigo_principal_fabricante_fallback(self):
        raw = [
            {"linea": 1, "descripcion": "Test", "cantidad": 1,
             "precio_unitario_bruto": 5, "ean": None,
             "codigo_fabricante": "FAB-001", "codigo_proveedor": "PROV-001",
             "descuento_1": None, "descuento_2": None, "descuento_3": None, "descuento_4": None},
        ]
        result = normalize_extracted_articles(raw)
        assert result[0]["codigo_principal"] == "FAB-001"


class TestSupplierDetection:
    def test_detects_by_keyword(self):
        suppliers = [
            {"id": 1, "name": "Ferretería Pérez", "detection_keywords": ["ferretería pérez", "FER-001"]},
            {"id": 2, "name": "Construcción Norte", "detection_keywords": ["construcción norte", "MCN-"]},
        ]
        text = "FERRETERÍA PÉREZ S.L. - Albarán ALB-2024-03456"
        result = detect_supplier(text, suppliers)
        assert result is not None
        assert result["id"] == 1

    def test_returns_none_when_not_found(self):
        suppliers = [
            {"id": 1, "name": "Proveedor X", "detection_keywords": ["keyword-xyz"]},
        ]
        text = "Documento sin coincidencia"
        result = detect_supplier(text, suppliers)
        assert result is None


class TestExtractionPrompt:
    def test_prompt_includes_text(self):
        raw_data = {
            "full_text": "Albarán de prueba\nArtículo 1   10.00  21%",
            "tables": [],
        }
        prompt = build_extraction_prompt(raw_data)
        assert "Albarán de prueba" in prompt

    def test_prompt_includes_table(self):
        raw_data = {
            "full_text": "",
            "tables": [["COD", "DESC", "PRECIO"], ["001", "Tornillo", "1.50"]],
        }
        prompt = build_extraction_prompt(raw_data)
        assert "Tornillo" in prompt

    def test_prompt_includes_supplier_hints(self):
        raw_data = {"full_text": "test", "tables": []}
        supplier_template = {"hints": "La columna 4 es el descuento"}
        prompt = build_extraction_prompt(raw_data, supplier_template)
        assert "columna 4" in prompt


@pytest.mark.asyncio
async def test_extract_with_claude_success():
    """Test Claude extraction with mocked API."""
    from app.services.extraction_service import extract_with_claude

    mock_response = {
        "documento": {
            "proveedor": "Ferretería Test",
            "num_albaran": "ALB-001",
            "fecha": "2024-03-15",
            "pronto_pago_pct": None,
        },
        "articulos": [
            {
                "linea": 1,
                "descripcion": "Tornillo M6",
                "cantidad": 10,
                "precio_unitario_bruto": 5.50,
                "descuento_1": 20,
                "descuento_2": None,
                "descuento_3": None,
                "descuento_4": None,
                "iva_pct": 21,
                "codigo_proveedor": "T001",
                "ean": None,
                "otros_codigos": {},
            }
        ]
    }

    mock_content = MagicMock()
    mock_content.text = json.dumps(mock_response)
    mock_message = MagicMock()
    mock_message.content = [mock_content]

    with patch("anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.return_value = mock_message

        raw_data = {"full_text": "test albaran", "tables": []}
        result = await extract_with_claude(raw_data)

        assert result["documento"]["proveedor"] == "Ferretería Test"
        assert len(result["articulos"]) == 1
        assert result["articulos"][0]["descripcion"] == "Tornillo M6"
