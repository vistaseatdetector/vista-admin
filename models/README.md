# Models Directory

Drop your trained YOLO weights here so the enhanced detection service can pick them up automatically.

Supported locations (any one of):

- `models/threats/weights/best.pt`
- `models/threats/weights/last.pt`
- `models/suspicious/weights/best.pt`
- `models/suspicious/weights/last.pt`

Simple fallbacks:

- `models/threats.pt`
- `models/suspicious.pt`

Alternatively, set an explicit path via environment variable (absolute or repo‑relative):

```
THREAT_MODEL_PATH=./models/threats/weights/best.pt
```

After adding the weights, restart the enhanced service and check `/health`:

```
{"status":"healthy","model_loaded":true,"active_streams":0,
 "suspicious_loaded":true,
 "threat_model_path":"/absolute/path/to/.../best.pt"}
```

