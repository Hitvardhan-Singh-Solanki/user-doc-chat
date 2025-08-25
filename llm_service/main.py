import asyncio
import torch
from fastapi import FastAPI
from transformers import AutoTokenizer, AutoModel
from contextlib import asynccontextmanager

model_name = "sentence-transformers/all-mpnet-base-v2"
_model = None
_tokenizer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model, _tokenizer
    _tokenizer = AutoTokenizer.from_pretrained(model_name)
    _model = AutoModel.from_pretrained(model_name)
    yield 
    _model = None
    _tokenizer = None

app = FastAPI(lifespan=lifespan)

async def get_model():
    return _model, _tokenizer

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None and _tokenizer is not None}

@app.post("/embed")
async def embed_text(req: dict):
    text = req.get("text")
    if not text:
        return {"error": "No text provided"}

    model, tokenizer = await get_model()

    def run_inference():
        inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True)
        with torch.no_grad():
            return model(**inputs).last_hidden_state.mean(dim=1).squeeze().tolist()

    embeddings = await asyncio.to_thread(run_inference)
    return {"embedding": embeddings}
