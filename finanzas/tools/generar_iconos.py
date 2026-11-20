"""Genera los íconos de la aplicación Finanzas familiares (fondo verde, barras de ahorro y signo $).

Uso (desde la carpeta finanzas):  python3 tools/generar_iconos.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SALIDA = Path(__file__).resolve().parent.parent / "icons"
VERDE_OSCURO, VERDE = (11, 61, 51), (15, 110, 90)


def fuente(tam):
    for ruta in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(ruta, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def icono(lado, margen=0.0, redondeo=0.22):
    escala = 4
    L = lado * escala
    img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Fondo con degradé vertical.
    fondo = Image.new("RGBA", (L, L))
    fd = ImageDraw.Draw(fondo)
    for y in range(L):
        t = y / L
        fd.line([(0, y), (L, y)], fill=tuple(int(VERDE[i] * (1 - t) + VERDE_OSCURO[i] * t) for i in range(3)) + (255,))
    mascara = Image.new("L", (L, L), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, L - 1, L - 1], radius=int(L * redondeo), fill=255)
    img.paste(fondo, (0, 0), mascara)
    # Zona útil (para el ícono "maskable" se deja margen).
    m = int(L * margen)
    u = L - 2 * m
    # Barras crecientes.
    base = m + int(u * 0.80)
    ancho = int(u * 0.12)
    for i, h in enumerate((0.22, 0.34, 0.48)):
        x = m + int(u * (0.16 + i * 0.17))
        d.rounded_rectangle([x, base - int(u * h), x + ancho, base], radius=int(ancho * 0.3), fill=(255, 255, 255, 235))
    # Signo $ en un círculo claro.
    cx, cy, r = m + int(u * 0.70), m + int(u * 0.38), int(u * 0.22)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 209, 102, 255))
    f = fuente(int(r * 1.45))
    d.text((cx, cy + int(r * 0.04)), "$", font=f, fill=VERDE_OSCURO + (255,), anchor="mm")
    return img.resize((lado, lado), Image.LANCZOS)


def main():
    SALIDA.mkdir(exist_ok=True)
    icono(192).save(SALIDA / "icon-192.png")
    icono(512).save(SALIDA / "icon-512.png")
    # iPhone: sin transparencia ni redondeo (iOS aplica su propia máscara).
    icono(180, redondeo=0).convert("RGB").save(SALIDA / "apple-touch-icon.png")
    icono(512, margen=0.12, redondeo=0).convert("RGB").save(SALIDA / "maskable-512.png")
    print("Íconos generados en", SALIDA)


if __name__ == "__main__":
    main()
