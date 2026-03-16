"""
Generate all sample test documents.
Run from backend directory: python -m sample_docs.generate_all
"""
from sample_docs.albaran_ferreteria import generate as gen1
from sample_docs.albaran_construccion import generate as gen2
from sample_docs.albaran_materiales import generate as gen3

if __name__ == "__main__":
    gen1("sample_docs/albaran_ferreteria_digital.pdf")
    gen2("sample_docs/albaran_construccion.pdf")
    gen3("sample_docs/albaran_materiales.pdf")
    print("Documentos de ejemplo generados en sample_docs/")
