#!/usr/bin/env python3
import json
from pathlib import Path

DATA = [
    {
        "id": "q1",
        "question": "What is the capital of France?",
        "context": "Paris is the capital and most populous city of France, with an estimated population of 2,102,650 residents as of 2023.",
        "answers": ["Paris"]
    },
    {
        "id": "q2",
        "question": "Who wrote 'To Kill a Mockingbird'?",
        "context": "To Kill a Mockingbird is a novel by Harper Lee published in 1960. It was immediately successful and won the Pulitzer Prize.",
        "answers": ["Harper Lee"]
    },
    {
        "id": "q3",
        "question": "What is the chemical symbol for gold?",
        "context": "Gold is a chemical element with the symbol Au (from Latin: aurum) and atomic number 79.",
        "answers": ["Au"]
    },
    {
        "id": "q4",
        "question": "Which planet is known as the Red Planet?",
        "context": "Mars is the fourth planet from the Sun and the second-smallest planet in the Solar System. It is often referred to as the Red Planet.",
        "answers": ["Mars"]
    },
    {
        "id": "q5",
        "question": "What year did the Apollo 11 moon landing occur?",
        "context": "Apollo 11 was the American spaceflight that first landed humans on the Moon on July 20, 1969.",
        "answers": ["1969"]
    },
    {
        "id": "q6",
        "question": "What is the speed of light in vacuum in meters per second?",
        "context": "The speed of light in vacuum, commonly denoted c, is a universal physical constant exactly equal to 299,792,458 metres per second.",
        "answers": ["299792458", "299,792,458"]
    },
    {
        "id": "q7",
        "question": "Who painted the Mona Lisa?",
        "context": "The Mona Lisa is a half-length portrait painting by Italian artist Leonardo da Vinci.",
        "answers": ["Leonardo da Vinci", "da Vinci"]
    },
    {
        "id": "q8",
        "question": "What is the largest ocean on Earth?",
        "context": "The Pacific Ocean is the largest and deepest of Earth's five oceanic divisions.",
        "answers": ["Pacific Ocean", "Pacific"]
    },
    {
        "id": "q9",
        "question": "What element does 'O' represent on the periodic table?",
        "context": "Oxygen is a chemical element with the symbol O and atomic number 8.",
        "answers": ["Oxygen"]
    },
    {
        "id": "q10",
        "question": "What is the capital of Japan?",
        "context": "Tokyo is the capital and largest city of Japan.",
        "answers": ["Tokyo"]
    }
]

def main():
    root = Path("SkillOpt/data/demo_qa_split")
    for split, items in [("train", DATA[:6]), ("val", DATA[6:8]), ("test", DATA[8:])]:
        split_dir = root / split
        split_dir.mkdir(parents=True, exist_ok=True)
        with open(split_dir / "items.json", "w") as f:
            json.dump(items, f, indent=2)
    
    manifest = {
        "split_mode": "custom_demo",
        "counts": {"train": 6, "val": 2, "test": 2}
    }
    with open(root / "split_manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print("Created demo dataset split at SkillOpt/data/demo_qa_split")

if __name__ == "__main__":
    main()
