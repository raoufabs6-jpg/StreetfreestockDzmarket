from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

FILE = Path(__file__).resolve().parents[1] / 'deliverables' / 'Calisthenics_AR.pptx'
PAGE = '''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تحميل عرض الكاليسثنيكس</title><style>body{margin:0;background:#101e2a;color:#f5f7f4;font:20px Arial,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:650px;padding:40px;text-align:center}h1{font-size:38px}p{line-height:1.8;color:#afc0c7}a{display:inline-block;padding:20px 30px;background:#49d3bc;color:#101e2a;border-radius:12px;font-weight:bold;text-decoration:none;margin:20px 0}small{display:block;color:#afc0c7}</style><main><h1>عرض الكاليسثنيكس</h1><p>15 شريحة باللغة العربية، مع الصور والجداول وملاحظات المتحدث.</p><a href="/download" download="Calisthenics.pptx">تنزيل ملف PowerPoint ↓</a><small>ملف PPTX قابل للتعديل · 308 كيلوبايت تقريبًا</small><p>إذا لم يبدأ التنزيل داخل المعاينة، افتح هذه الصفحة في تبويب جديد ثم اضغط زر التنزيل.</p></main></html>'''.encode('utf-8')
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/download':
            data = FILE.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type','application/vnd.openxmlformats-officedocument.presentationml.presentation')
            self.send_header('Content-Disposition','attachment; filename="Calisthenics.pptx"')
        elif self.path.split('?')[0] == '/':
            data=PAGE
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
        else:
            self.send_error(404)
            return
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        self.wfile.write(data)
HTTPServer(('0.0.0.0',8000),Handler).serve_forever()
