"""Read settings dataclasses from TOML tables and write them back."""

import json
from dataclasses import fields
from pathlib import Path


def merge(obj, data: dict) -> None:
    """Copy known keys from data onto a dataclass, keeping defaults for the rest."""
    if isinstance(data.get("hours"), int) and "minutes" not in data:  # older configs kept whole hours
        data = {**data, "minutes": data["hours"] * 60}
    for f in fields(obj):
        if f.name not in data:
            continue
        current = getattr(obj, f.name)
        value = data[f.name]
        if hasattr(current, "__dataclass_fields__") and isinstance(value, dict):
            merge(current, value)
        elif isinstance(current, bool):
            setattr(obj, f.name, bool(value))
        elif isinstance(current, int) and isinstance(value, int):
            setattr(obj, f.name, value)
        elif isinstance(current, str) and isinstance(value, str):
            setattr(obj, f.name, value)


def toml_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return json.dumps(str(v), ensure_ascii=False)


def table(out: list[str], name: str, data: dict) -> None:
    """Append [name] with its plain keys, then each nested dict as [name.key]."""
    if out and out[-1]:
        out.append("")
    out.append(f"[{name}]")
    out += [f"{k} = {toml_value(v)}" for k, v in data.items() if not isinstance(v, dict)]
    for k, v in data.items():
        if isinstance(v, dict):
            table(out, f"{name}.{k}", v)


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
