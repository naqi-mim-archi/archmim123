import json

path = r"C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\Archi26\01. Codes\02. Working Codes\260630_0055\ml\auto_plan\tuning_dataset_100.jsonl"
converted = []
with open(path, 'r') as f:
    for line in f:
        data = json.loads(line)
        user_text = ""
        model_text = ""
        for msg in data.get("messages", []):
            if msg["role"] == "user":
                user_text = msg["content"]
            elif msg["role"] in ["model", "assistant"]:
                model_text = msg["content"]
        
        converted.append({
            "contents": [
                {"role": "user", "parts": [{"text": user_text}]},
                {"role": "model", "parts": [{"text": model_text}]}
            ]
        })

with open(path, 'w') as f:
    for item in converted:
        f.write(json.dumps(item) + '\n')

print("Conversion complete!")
