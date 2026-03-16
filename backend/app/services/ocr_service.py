"""
OCR service using OpenCV (preprocessing) + pytesseract.
Used for scanned PDFs and images (JPG, PNG).
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def preprocess_image(img_array: np.ndarray) -> np.ndarray:
    """Apply preprocessing to improve OCR accuracy.

    Steps: convert to grayscale → deskew → binarize → denoise
    """
    import cv2

    # Convert to grayscale if needed
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_array.copy()

    # Deskew
    gray = deskew(gray)

    # Binarize (Otsu's threshold)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(binary, h=10)

    return denoised


def deskew(img: np.ndarray) -> np.ndarray:
    """Correct skew in a grayscale image."""
    import cv2

    try:
        # Find all non-zero (dark) pixels
        coords = np.column_stack(np.where(img < 128))
        if len(coords) < 100:
            return img

        angle = cv2.minAreaRect(coords)[-1]

        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        # Only correct if skew is significant
        if abs(angle) < 0.5 or abs(angle) > 15:
            return img

        (h, w) = img.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            img, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated
    except Exception:
        return img


def extract_text_from_image_file(file_path: str, lang: str = "spa+eng") -> str:
    """Run OCR on an image file (JPG, PNG).

    Args:
        file_path: Path to the image file
        lang: Tesseract language string
    Returns:
        Extracted text
    """
    try:
        import cv2
        import pytesseract
        from PIL import Image

        # Load image
        img = cv2.imread(file_path)
        if img is None:
            # Try with PIL (some formats cv2 doesn't handle)
            pil_img = Image.open(file_path).convert("RGB")
            img = np.array(pil_img)
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        processed = preprocess_image(img)

        # OCR config: PSM 6 = assume single uniform block of text
        config = f"--oem 3 --psm 6 -l {lang}"
        text = pytesseract.image_to_string(processed, config=config)
        return text

    except Exception as e:
        logger.error(f"OCR failed for {file_path}: {e}")
        return ""


def extract_text_from_pil_image(pil_image, lang: str = "spa+eng") -> str:
    """Run OCR on a PIL Image object."""
    try:
        import cv2
        import pytesseract

        img_array = np.array(pil_image.convert("RGB"))
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        processed = preprocess_image(img_bgr)

        config = f"--oem 3 --psm 6 -l {lang}"
        return pytesseract.image_to_string(processed, config=config)

    except Exception as e:
        logger.error(f"OCR failed on PIL image: {e}")
        return ""


def extract(file_path: str, lang: str = "spa+eng") -> dict:
    """Main entry point for image/scanned document extraction.

    Handles: JPG, PNG, scanned PDFs (via pdf2image).
    Returns same format as pdf_service.extract_text_and_tables().
    """
    from pathlib import Path as P
    suffix = P(file_path).suffix.lower()

    all_texts = []

    if suffix == ".pdf":
        # Convert PDF pages to images, then OCR each page
        from app.services.pdf_service import pdf_to_images
        images = pdf_to_images(file_path)
        for i, img in enumerate(images):
            text = extract_text_from_pil_image(img, lang)
            all_texts.append({"page_number": i + 1, "text": text, "tables": []})
    else:
        # Direct image file
        text = extract_text_from_image_file(file_path, lang)
        all_texts.append({"page_number": 1, "text": text, "tables": []})

    full_text = "\n\n".join(p["text"] for p in all_texts)

    return {
        "full_text": full_text,
        "pages": all_texts,
        "tables": [],
    }
