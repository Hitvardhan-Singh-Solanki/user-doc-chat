import os
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModel
import torch
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = os.getenv("HUGGINGFACE_EMBEDDING_MODEL")
if not MODEL_NAME:
    raise RuntimeError("HUGGINGFACE_EMBEDDING_MODEL not set in .env")

app = FastAPI(title="Embedding Service")

# Global tokenizer and model
tokenizer = None
model = None

async def load_model():
    global tokenizer, model
    print("[DEBUG] Starting model load...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        print("[DEBUG] Tokenizer loaded")
        model = AutoModel.from_pretrained(MODEL_NAME)
        model.eval()
        print(f"[DEBUG] Model loaded successfully: {MODEL_NAME}")
    except Exception as e:
        print("[ERROR] Failed to load model:", e)
        raise

@app.on_event("startup")
async def startup_event():
    print("[DEBUG] Application startup: loading model")
    await load_model()
    print("[DEBUG] Startup complete")

class TextRequest(BaseModel):
    text: str

@app.post("/embed")
async def embed_text(req: TextRequest):
    print("[DEBUG] Received embed request")
    print(f"[DEBUG] Request text length: {len(req.text)}")

    if not tokenizer or not model:
        print("[ERROR] Model not loaded yet")
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    def run_inference():
        print("[DEBUG] Starting inference in thread")
        try:
            with torch.no_grad():
                inputs = tokenizer(req.text, return_tensors="pt", truncation=True, padding=True, max_length=512)
                outputs = model(**inputs)
                embeddings = outputs.last_hidden_state.mean(dim=1)
                print("[DEBUG] Inference complete")
                return embeddings[0].tolist()
        except Exception as e:
            print("[ERROR] Exception during inference:", e)
            raise

    loop = asyncio.get_event_loop()
    try:
        vector = await loop.run_in_executor(None, run_inference)
    except Exception as e:
        print("[ERROR] Inference failed:", e)
        raise HTTPException(status_code=500, detail=str(e))

    print(f"[DEBUG] Returning embedding of dimension: {len(vector)}")
    return {"embedding": vector, "dimension": len(vector)}

@app.get("/health")
async def health_check():
    print("[DEBUG] Health check requested")
    return {"status": "ok"}
