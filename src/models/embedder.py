"""Sentence embedding shared by Stage 1 (MASTER_PROMPT §5.0, §11.1).

Masked mean pooling over the last hidden state, then L2-normalise. The ONNX export
wraps exactly this module, so prototypes, the Python reference and the browser all
embed text the same way.
"""

from __future__ import annotations

import torch
from torch import nn

BASE_MODEL = "BAAI/bge-small-en-v1.5"
MAX_LENGTH = 128


def mean_pool(last_hidden: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
    mask = attention_mask.unsqueeze(-1).to(last_hidden.dtype)
    summed = (last_hidden * mask).sum(dim=1)
    counts = mask.sum(dim=1).clamp(min=1e-9)
    return summed / counts


class PooledEmbedder(nn.Module):
    """forward(input_ids, attention_mask) -> [batch, dim] mean-pooled, L2-normalised embedding."""

    def __init__(self, encoder: nn.Module):
        super().__init__()
        self.encoder = encoder

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        pooled = mean_pool(out.last_hidden_state, attention_mask)
        return nn.functional.normalize(pooled, p=2, dim=-1)


class TextEmbedder:
    """Tokenizer + PooledEmbedder on CPU, for Python-side embedding."""

    def __init__(self, base_model: str = BASE_MODEL, device: str = "cpu"):
        from transformers import AutoModel, AutoTokenizer  # noqa: PLC0415

        self.base_model = base_model
        self.device = device
        self.tokenizer = AutoTokenizer.from_pretrained(base_model)
        self.model = PooledEmbedder(AutoModel.from_pretrained(base_model)).eval().to(device)

    def tokenize(self, texts: list[str]) -> dict[str, torch.Tensor]:
        return self.tokenizer(texts, truncation=True, max_length=MAX_LENGTH, padding=True, return_tensors="pt")

    @torch.no_grad()
    def embed(self, texts: list[str], batch_size: int = 64) -> torch.Tensor:
        chunks = []
        for i in range(0, len(texts), batch_size):
            enc = self.tokenize(texts[i:i + batch_size])
            chunks.append(self.model(enc["input_ids"].to(self.device), enc["attention_mask"].to(self.device)).cpu())
        return torch.cat(chunks) if chunks else torch.empty(0, 384)
