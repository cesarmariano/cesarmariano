"""Genera los íconos de la aplicación a partir de logo.png.

Uso (desde la carpeta raíz del proyecto):
  python3 tools/generar_iconos.py [ruta/al/logo] [ruta/al/simbolo]
- logo: imagen completa; se guarda como logo.png (para el PDF).
- simbolo: imagen usada para los íconos (por ejemplo, sólo el isotipo). Si se omite, se usa el logo.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent.parent
LOGO = BASE / "logo.png"
LOGO_PDF = BASE / "logo.jpg"
SALIDA = BASE / "icons"
ETIQUETA = "B2B"  # franja inferior que distingue esta aplicación de la de visitas médicas
AZUL = (10, 31, 99)


def con_etiqueta(img, margen):
    """Agrega una franja azul con la etiqueta en la parte inferior del ícono."""
    lado = img.width
    dib = ImageDraw.Draw(img)
    alto = int(lado * 0.24)
    y0 = lado - alto - int(lado * margen * 0.6)
    dib.rectangle([0, y0, lado, y0 + alto], fill=AZUL)
    try:
        fuente = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(alto * 0.72))
    except OSError:
        fuente = ImageFont.load_default()
    caja = dib.textbbox((0, 0), ETIQUETA, font=fuente)
    dib.text(((lado - (caja[2] - caja[0])) / 2 - caja[0], y0 + (alto - (caja[3] - caja[1])) / 2 - caja[1]),
             ETIQUETA, font=fuente, fill=(255, 255, 255))
    return img


def cuadrado(img, lado, margen):
    lienzo = Image.new("RGBA", (lado, lado), (255, 255, 255, 255))
    util = int(lado * (1 - 2 * margen))
    copia = img.copy()
    copia.thumbnail((util, int(util * 0.72)), Image.LANCZOS)
    lienzo.alpha_composite(copia, ((lado - copia.width) // 2, int(lado * margen) + (int(util * 0.72) - copia.height) // 2))
    return con_etiqueta(lienzo.convert("RGB"), margen)


def recortar_bordes(img):
    """Quita bordes transparentes o blancos alrededor del logo."""
    rgba = img.convert("RGBA")
    fondo = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    plano = Image.alpha_composite(fondo, rgba).convert("L").point(lambda p: 255 if p < 245 else 0)
    caja = plano.getbbox()
    return rgba.crop(caja) if caja else rgba


def main():
    if len(sys.argv) > 1:
        origen = Image.open(sys.argv[1]).convert("RGBA")
        origen = recortar_bordes(origen)
        origen.thumbnail((900, 900), Image.LANCZOS)
        origen.save(LOGO, optimize=True)
        # Versión liviana para el PDF (JPEG sobre fondo blanco)
        fondo = Image.new("RGBA", origen.size, (255, 255, 255, 255))
        Image.alpha_composite(fondo, origen).convert("RGB").resize(
            (600, round(600 * origen.height / origen.width)), Image.LANCZOS).save(LOGO_PDF, quality=88)
    fuente = sys.argv[2] if len(sys.argv) > 2 else LOGO
    img = recortar_bordes(Image.open(fuente).convert("RGBA"))
    SALIDA.mkdir(exist_ok=True)
    cuadrado(img, 192, 0.08).save(SALIDA / "icon-192.png", optimize=True)
    cuadrado(img, 512, 0.08).save(SALIDA / "icon-512.png", optimize=True)
    cuadrado(img, 512, 0.20).save(SALIDA / "maskable-512.png", optimize=True)
    cuadrado(img, 180, 0.08).save(SALIDA / "apple-touch-icon.png", optimize=True)
    print("Íconos generados en", SALIDA)


if __name__ == "__main__":
    main()
