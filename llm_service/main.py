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
    """
    Load the tokenizer and model specified by MODEL_NAME into module-level globals.
    
    Initializes the global `tokenizer` and `model` by calling `AutoTokenizer.from_pretrained`
    and `AutoModel.from_pretrained` with `MODEL_NAME`, then puts the model into evaluation
    mode (`model.eval()`). Raises any exception encountered during loading so callers (or
    the application startup) can handle or fail fast.
    
    Side effects:
    - Sets the module-level `tokenizer` and `model` variables.
    
    Exceptions:
    - Propagates the underlying exception raised by Hugging Face `from_pretrained` calls.
    """
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
    """
    FastAPI startup handler that initializes the global tokenizer and model.
    
    Awaits load_model() to load and prepare the model and tokenizer into the module's global state. If load_model raises an exception, the application startup will fail. Emits brief debug output to stdout.
    """
    print("[DEBUG] Application startup: loading model")
    await load_model()
    print("[DEBUG] Startup complete")

class TextRequest(BaseModel):
    text: str

@app.post("/embed")
async def embed_text(req: TextRequest):
    """
    Compute an embedding for the provided text and return it with its dimensionality.
    
    Performs model inference (run in a thread to avoid blocking the event loop) and returns a JSON-serializable dict containing:
    - "embedding": list[float] — the mean-pooled embedding computed from the model's last_hidden_state.
    - "dimension": int — length of the embedding vector.
    
    Parameters:
        req (TextRequest): Request model containing the input text in `req.text`.
    
    Raises:
        HTTPException(503): If the tokenizer or model is not yet loaded.
        HTTPException(500): If an error occurs during inference.
    """
    print("[DEBUG] Received embed request")
    print(f"[DEBUG] Request text length: {len(req.text)}")

    if not tokenizer or not model:
        print("[ERROR] Model not loaded yet")
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    def run_inference():
        """
        Run the tokenizer and model to produce a mean-pooled embedding for the request text and return it as a list of floats.
        
        The function tokenizes `req.text`, runs the model in inference mode, computes the mean across token hidden states (mean pooling of `last_hidden_state`), and returns the resulting embedding vector as a Python list. Any exceptions raised by the tokenizer or model are propagated.
        """
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
    """
    Return a simple health status for the service.
    
    Used by the GET /health endpoint to indicate liveness. Returns a dictionary with a single key "status" set to "ok".
    
    Returns:
        dict: {"status": "ok"}
    """
    print("[DEBUG] Health check requested")
    return {"status": "ok"}
