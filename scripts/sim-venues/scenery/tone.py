# Warm a photo with a cool cast (Tasmania's orthophoto reads grey-blue): scale the channels so the median
# ground comes out a warm grey.   python3 tone.py <dir>
import sys, numpy as np
from PIL import Image
root = sys.argv[1]
for name, q in (('near.webp', 72), ('wide.webp', 70)):
    a = np.asarray(Image.open(f'{root}/{name}').convert('RGB')).astype(np.float32)
    med = np.median(a.reshape(-1, 3), axis=0)
    target = med.mean() * np.array([1.06, 1.0, 0.86])
    out = np.clip(a * (target / med), 0, 255).astype(np.uint8)
    Image.fromarray(out).save(f'{root}/{name}', quality=q, method=6)
    print(name, med.round(), '->', target.round())
