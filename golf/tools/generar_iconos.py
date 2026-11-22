"""Genera los íconos de la aplicación (bandera de golf sobre fondo verde). Uso: python3 tools/generar_iconos.py"""
from pathlib import Path
from PIL import Image, ImageDraw

DIR = Path(__file__).resolve().parent.parent / 'icons'
VERDE, VERDE_CLARO, BLANCO, ROJO = (20, 83, 45), (34, 120, 70), (255, 255, 255), (227, 73, 72)


def dibujar(tam, margen=0.0, redondo=True):
    esc = 4
    t = tam * esc
    img = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if redondo:
        d.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(t * 0.22), fill=VERDE)
    else:
        d.rectangle([0, 0, t, t], fill=VERDE)
    m = t * margen
    u = (t - 2 * m) / 100
    x = lambda v: m + v * u
    d.ellipse([x(18), x(70), x(82), x(86)], fill=VERDE_CLARO)          # green
    d.line([x(42), x(20), x(42), x(78)], fill=BLANCO, width=int(4 * u))  # asta
    d.polygon([(x(44), x(20)), (x(72), x(30)), (x(44), x(40))], fill=ROJO)  # bandera
    d.ellipse([x(55), x(68), x(65), x(78)], fill=BLANCO)                  # bola
    return img.resize((tam, tam), Image.LANCZOS)


DIR.mkdir(exist_ok=True)
dibujar(192).save(DIR / 'icon-192.png')
dibujar(512).save(DIR / 'icon-512.png')
dibujar(512, margen=0.12, redondo=False).save(DIR / 'maskable-512.png')
dibujar(180, redondo=False).convert('RGB').save(DIR / 'apple-touch-icon.png')
print('Íconos generados en', DIR)
