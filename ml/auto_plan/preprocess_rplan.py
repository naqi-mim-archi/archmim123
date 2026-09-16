import pickle
import zipfile
import io
import json
import numpy as np
import scipy.io as sio
import os
from google import genai
from google.genai import types

# Setup RPlan path
zip_path = r"C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\Archi26\05. Case St\Existing Model Files\RPlan Dataset 2025.zip"

ROOM_TYPES = {
    0: "LivingRoom",
    1: "MasterBedroom",
    2: "Kitchen",
    3: "Bathroom",
    4: "DiningRoom",
    5: "ChildBedroom",
    6: "GuestBedroom",
    7: "Balcony",
    8: "Entrance",
    9: "Corridor",
    10: "Stair",
    11: "Study",
    12: "Store"
}

def scale_point(pt, scale=0.06):
    # Scale from 256 grid to meters and invert Y to make it Cartesian (Y increases upwards)
    x = float(pt[0]) * scale
    y = (256.0 - float(pt[1])) * scale
    return [round(x, 3), round(y, 3)]

def get_line_midpoint(p1, p2):
    return [round((p1[0] + p2[0]) / 2, 3), round((p1[1] + p2[1]) / 2, 3)]

def get_line_length(p1, p2):
    return np.hypot(p2[0] - p1[0], p2[1] - p1[1])

def get_line_angle(p1, p2):
    return float(np.atan2(p2[1] - p1[1], p2[0] - p1[0]))

def parse_item(item):
    """
    Parses a single RPlan MATLAB struct item and builds a high-fidelity 
    schema-compliant JSON representation matching SHARED_SCHEMA.
    """
    rBoundaries = item.rBoundary
    rTypes = item.rType
    
    # Handle single room case if it's squeezed to a single array
    if isinstance(rBoundaries, np.ndarray) and rBoundaries.ndim == 2:
        rBoundaries = [rBoundaries]
        rTypes = [rTypes]
        
    num_rooms = len(rBoundaries)
    
    rooms_data = []
    walls_data = []
    slabs_data = []
    doors_data = []
    windows_data = []
    
    # 1. Rooms & Slabs
    for i in range(num_rooms):
        poly = rBoundaries[i]
        t_idx = int(rTypes[i])
        label = ROOM_TYPES.get(t_idx, "Room")
        
        # Scale polygon points
        scaled_poly = [scale_point(pt) for pt in poly]
        
        # Room position is the polygon centroid
        centroid = np.mean(scaled_poly, axis=0)
        room_pos = [round(centroid[0], 3), round(centroid[1], 3)]
        
        rooms_data.append({
            "levelIndex": 0,
            "label": label,
            "pos": room_pos
        })
        
        slabs_data.append({
            "levelIndex": 0,
            "boundary": scaled_poly,
            "type": "floor"
        })
        
    # 2. Extract Walls from Room Polygons
    segments = [] # List of tuples: (p1, p2, room_index, wall_type)
    for i in range(num_rooms):
        poly = rBoundaries[i]
        scaled_poly = [scale_point(pt) for pt in poly]
        n_pts = len(scaled_poly)
        for idx in range(n_pts):
            p1 = scaled_poly[idx]
            p2 = scaled_poly[(idx + 1) % n_pts]
            
            # Ensure p1 < p2 order to easily find duplicates
            if p1[0] < p2[0] or (p1[0] == p2[0] and p1[1] < p2[1]):
                seg_key = (tuple(p1), tuple(p2))
            else:
                seg_key = (tuple(p2), tuple(p1))
                
            segments.append((seg_key, i))
            
    # Count occurrences of segments to classify interior vs exterior
    seg_counts = {}
    for seg, r_idx in segments:
        seg_counts[seg] = seg_counts.get(seg, []) + [r_idx]
        
    for seg, r_indices in seg_counts.items():
        p1 = list(seg[0])
        p2 = list(seg[1])
        if len(r_indices) > 1:
            # Interior partition wall
            walls_data.append({
                "levelIndex": 0,
                "p1": p1,
                "p2": p2,
                "curveType": "line",
                "type": "interior"
            })
            
            # Procedural door placement: 
            # If one room is a Private Room (Bedroom/Bath/Kitchen) and the other is a circulation room (Corridor/Living/Entrance), place a door.
            r1_label = ROOM_TYPES.get(int(rTypes[r_indices[0]]), "Room")
            r2_label = ROOM_TYPES.get(int(rTypes[r_indices[1]]), "Room")
            
            private_rooms = ["MasterBedroom", "ChildBedroom", "GuestBedroom", "Bathroom", "Kitchen"]
            circulation_rooms = ["Corridor", "LivingRoom", "Entrance", "DiningRoom"]
            
            is_door_needed = (
                (r1_label in private_rooms and r2_label in circulation_rooms) or
                (r2_label in private_rooms and r1_label in circulation_rooms)
            )
            
            if is_door_needed:
                length = get_line_length(p1, p2)
                if length > 1.2: # Only place if wall segment is long enough
                    midpoint = get_line_midpoint(p1, p2)
                    angle = get_line_angle(p1, p2)
                    doors_data.append({
                        "levelIndex": 0,
                        "pos": midpoint,
                        "rotation": round(angle, 4),
                        "type": "single",
                        "width": 0.9
                    })
        else:
            # Exterior wall
            walls_data.append({
                "levelIndex": 0,
                "p1": p1,
                "p2": p2,
                "curveType": "line",
                "type": "exterior"
            })
            
            # Procedural window placement:
            # Place window on exterior walls of LivingRoom, Bedrooms, and Kitchens
            r_idx = r_indices[0]
            r_label = ROOM_TYPES.get(int(rTypes[r_idx]), "Room")
            window_rooms = ["LivingRoom", "MasterBedroom", "ChildBedroom", "GuestBedroom", "Kitchen", "DiningRoom"]
            if r_label in window_rooms:
                length = get_line_length(p1, p2)
                if length > 1.8: # Place window if segment is long enough
                    midpoint = get_line_midpoint(p1, p2)
                    angle = get_line_angle(p1, p2)
                    windows_data.append({
                        "levelIndex": 0,
                        "pos": midpoint,
                        "rotation": round(angle, 4),
                        "type": "standard",
                        "width": 1.2
                    })

    # Assemble JSON object matching SHARED_SCHEMA
    plan_json = {
        "metadata": {
            "buildingType": "apartment",
            "totalArea": 75.0,
            "layoutType": "modern"
        },
        "walls": walls_data,
        "rooms": rooms_data,
        "slabs": slabs_data,
        "doors": doors_data,
        "windows": windows_data,
        "columns": [],
        "openings": [],
        "stairs": [],
        "railings": [],
        "furniture": [],
        "fixtures": []
    }
    
    return plan_json

def generate_design_brief(client, plan_json):
    """
    Calls Gemini to generate a realistic user prompt/design brief 
    describing this layout JSON.
    """
    sys_instruction = "You are an architectural assistant. Analyze the provided floorplan JSON and write a simple, natural user request (design brief) describing what they need, e.g. 'I need a 2 bedroom apartment with an attached bath, open kitchen, and a balcony.' Do not mention coordinate details, just mention counts of rooms, overall layout, and adjacencies."
    
    prompt = f"Floorplan JSON:\n{json.dumps(plan_json, indent=2)}\n\nGenerate the user request prompt:"
    
    response = client.models.generate_content(
        model='gemini-3.5-flash',
        contents=[prompt],
        config=types.GenerateContentConfig(
            system_instruction=sys_instruction,
            max_output_tokens=150,
            temperature=0.7
        )
    )



    return response.text.strip().replace('"', '')

def main():
    # Load API Key from project .env or .env.local
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        for filename in [".env.local", ".env"]:
            path = os.path.join(r"C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\Archi26\01. Codes\02. Working Codes\260630_0055", filename)
            if os.path.exists(path):
                try:
                    with open(path) as env_f:
                        for line in env_f:
                            if line.startswith("GEMINI_API_KEY="):
                                api_key = line.split("=")[1].strip()
                                os.environ["GEMINI_API_KEY"] = api_key
                                break
                except Exception:
                    pass
                if api_key:
                    break
            
    print("Initializing GenAI Client...")

    client = genai.Client()
    
    print("Opening zip archive...")
    with zipfile.ZipFile(zip_path, 'r') as archive:
        mat_name = 'Network/data/data_train.mat'
        print(f"Loading {mat_name}...")
        with archive.open(mat_name) as f:
            mat = sio.loadmat(io.BytesIO(f.read()), struct_as_record=False, squeeze_me=True)
            data = mat['data']
            
            print(f"Successfully loaded {len(data)} items.")
            
            # Phase 1: Process 100 samples
            num_samples = 100
            training_pairs = []
            
            for i in range(num_samples):
                item = data[i]
                print(f"Processing plan {i+1}/{num_samples} (Name: {item.name})...")
                plan_json = parse_item(item)
                
                # Generate natural language brief
                brief = generate_design_brief(client, plan_json)
                print(f" - Generated Brief: {brief}")
                
                pair = {
                    "contents": [
                        {"role": "user", "parts": [{"text": f"Design a floorplan with these requirements: {brief}"}]},
                        {"role": "model", "parts": [{"text": json.dumps(plan_json)}]}
                    ]
                }
                training_pairs.append(pair)
                
            # Save dataset as JSONL
            output_jsonl = r"C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\Archi26\01. Codes\02. Working Codes\260630_0055\ml\auto_plan\tuning_dataset_100.jsonl"
            print(f"Saving training pairs to {output_jsonl}...")
            with open(output_jsonl, 'w') as out_f:
                for pair in training_pairs:
                    out_f.write(json.dumps(pair) + '\n')
            print("Preprocessing complete!")

if __name__ == "__main__":
    main()
