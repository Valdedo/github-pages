"""
OCR service using OpenCV (preprocessing) + pytesseract.
Used for scanned PDFs and images (JPG, PNG).
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def _fix_exif_orientation(pil_image):
    """Apply EXIF orientation correction (critical for mobile camera photos)."""
    try:
        from PIL import ImageOps
        return ImageOps.exif_transpose(pil_image)
    except Exception:
        return pil_image


def _scale_for_ocr(img_array: np.ndarray) -> np.ndarray:
    """Scale image to an optimal size range for OCR.

    Upscale if too small (<1500px), downscale if too large (>3500px).
    Very large mobile photos slow OCR without improving accuracy.
    Very small images miss fine detail.
    """
    import cv2

    h, w = img_array.shape[:2]
    max_dim = max(h, w)

    if max_dim > 3500:
        scale = 3500 / max_dim
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(img_array, (new_w, new_h), interpolation=cv2.INTER_AREA)
    elif max_dim < 1500:
        scale = 1500 / max_dim
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(img_array, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    return img_array


def preprocess_image(img_array: np.ndarray, is_photo: bool = False) -> np.ndarray:
    """Apply preprocessing to improve OCR accuracy.

    Steps: scale → convert to grayscale → deskew → binarize → denoise

    Args:
        img_array: Input image as numpy array
        is_photo: True for mobile/camera photos (uses adaptive threshold),
                  False for scanned docs (uses Otsu's threshold)
    """
    import cv2

    # Scale to optimal size range
    img_array = _scale_for_ocr(img_array)

    # Convert to grayscale if needed
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_array.copy()

    # Deskew
    gray = deskew(gray)

    if is_photo:
        # Adaptive threshold handles uneven lighting in mobile photos
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
        )
    else:
        # Otsu's threshold works well for uniform scanned documents
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

    Loads via PIL first to apply EXIF orientation correction (mobile photos).

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

        # Always load via PIL first to handle EXIF orientation (mobile cameras)
        pil_img = Image.open(file_path)
        pil_img = _fix_exif_orientation(pil_img)
        pil_img = pil_img.convert("RGB")
        img = np.array(pil_img)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        # is_photo=True uses adaptive threshold (better for camera images)
        processed = preprocess_image(img, is_photo=True)

        # PSM 3 = fully automatic page segmentation (better for document photos)
        config = f"--oem 3 --psm 3 -l {lang}"
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
