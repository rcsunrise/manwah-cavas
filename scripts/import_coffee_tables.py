"""
把 08_纯茶几素材 导入成 4/3 产品海报用的茶几素材库：assets/coffee-tables/<系列>/<商品编码>.jpg + catalog.json。
素材有增删时重新跑一遍即可（会整体覆盖 assets/coffee-tables）。

用法：python -X utf8 scripts/import_coffee_tables.py [素材文件夹，默认 08_纯茶几素材]
"""
import csv
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '08_纯茶几素材')
DST = os.path.join(ROOT, 'assets', 'coffee-tables')

SERIES = [
    ('noble', '贵族', '01_贵族配套', '贵族配套_纯茶几清单.csv'),
    ('gentleman', '绅士', '02_绅士配套', '绅士配套_纯茶几清单.csv'),
    ('meiju', '美居', '03_美居配套', '美居配套_纯茶几清单.csv'),
]
# 名字里出现这些就不是茶几（清单整理时偶尔混进来）
NOT_TABLE = ('餐椅', '边几', '角几', '跨几', '餐台', '地柜', '餐边柜')

if os.path.isdir(DST):
    shutil.rmtree(DST)
items = []
for sid, label, folder, csv_name in SERIES:
    os.makedirs(os.path.join(DST, sid), exist_ok=True)
    with open(os.path.join(SRC, folder, csv_name), encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            name = row['商品名称'].strip()
            code = row['商品编码'].strip()
            src_img = os.path.join(SRC, folder, '图片', row['图片文件'].strip())
            if any(k in name for k in NOT_TABLE) or not code or not os.path.isfile(src_img):
                print('跳过', label, name, code)
                continue
            shutil.copyfile(src_img, os.path.join(DST, sid, f'{code}.jpg'))
            retail = row['零售价'].strip()
            items.append({
                'id': f'ct-{code}',
                'series': sid,
                'name': name,
                'spec': ' '.join(row['规格及前置字段'].split()),
                'retailPrice': float(retail) if retail.replace('.', '', 1).isdigit() else None,
                'file': f'{sid}/{code}.jpg',
            })

with open(os.path.join(DST, 'catalog.json'), 'w', encoding='utf-8') as f:
    json.dump({'series': [{'id': s[0], 'label': s[1]} for s in SERIES], 'items': items}, f, ensure_ascii=False, indent=1)
for sid, label, *_ in SERIES:
    print(label, sum(1 for i in items if i['series'] == sid), '款')
