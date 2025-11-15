"""
Lightweight ASGI wrapper for the enhanced YOLO service.

Run locally:
  uvicorn yolo_api.main:app --host 0.0.0.0 --port 8001

We reuse the existing FastAPI app defined in
python-backend/yolo_detection_service_enhanced.py.
"""
from importlib.machinery import SourceFileLoader
from importlib.util import spec_from_loader, module_from_spec
from pathlib import Path

_module_path = Path(__file__).resolve().parents[1] / "python-backend" / "yolo_detection_service_enhanced.py"
loader = SourceFileLoader("yolo_detection_service_enhanced", str(_module_path))
spec = spec_from_loader(loader.name, loader)
mod = module_from_spec(spec)  # type: ignore
assert spec and spec.loader
spec.loader.exec_module(mod)  # type: ignore

app = mod.app  # FastAPI instance
