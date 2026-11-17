"""Genera los íconos de la aplicación a partir de logo.png.

Uso (desde la carpeta visitas-alveon):  python3 tools/generar_iconos.py [ruta/al/logo.png]
Si se indica una ruta, primero se copia esa imagen como logo.png (reducida a 800 px de ancho).
"""
import sys
from pathlib import Path
from PIL import Image

BASE = Path(__file__).resolve().parent.parent
LOGO = BASE / "logo.png"
SALIDA = BASE / "icons"


def cuadrado(img, lado, margen):
    lienzo = Image.new("RGBA", (lado, lado), (255, 255, 255, 255))
    util = int(lado * (1 - 2 * margen))
    copia = img.copy()
    copia.thumbnail((util, util), Image.LANCZOS)
    lienzo.alpha_composite(copia, ((lado - copia.width) // 2, (lado - copia.height) // 2))
    return lienzo.convert("RGB")


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
        origen.thumbnail((800, 800), Image.LANCZOS)
        origen.save(LOGO, optimize=True)
    img = recortar_bordes(Image.open(LOGO))
    SALIDA.mkdir(exist_ok=True)
    cuadrado(img, 192, 0.08).save(SALIDA / "icon-192.png", optimize=True)
    cuadrado(img, 512, 0.08).save(SALIDA / "icon-512.png", optimize=True)
    cuadrado(img, 512, 0.20).save(SALIDA / "maskable-512.png", optimize=True)
    cuadrado(img, 180, 0.08).save(SALIDA / "apple-touch-icon.png", optimize=True)
    print("Íconos generados en", SALIDA)


if __name__ == "__main__":
    main()
