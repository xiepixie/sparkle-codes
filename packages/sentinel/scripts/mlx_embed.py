#!/usr/bin/env python3
# /// script
# dependencies = [
#   "mlx-embeddings",
#   "numpy",
# ]
# ///
import sys
import json
from mlx_embeddings import load, generate

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No model path provided"}))
        sys.exit(1)
        
    model_path = sys.argv[1]
    
    # Read input from stdin (JSON list of strings)
    try:
        input_data = sys.stdin.read()
        if not input_data:
            sys.exit(0)
        texts = json.loads(input_data)
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse input: {str(e)}"}))
        sys.exit(1)

    if not isinstance(texts, list):
        print(json.dumps({"error": "Input must be a JSON list of strings"}))
        sys.exit(1)

    try:
        # Load model
        model, tokenizer = load(model_path)
        
        # Generate embeddings
        output = generate(model, tokenizer, texts=texts)
        embeddings = output.text_embeds.tolist() # Convert numpy/mlx array to list
        
        # Output JSON
        print(json.dumps({"embeddings": embeddings}))
    except Exception as e:
        print(json.dumps({"error": f"MLX Inference error: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
