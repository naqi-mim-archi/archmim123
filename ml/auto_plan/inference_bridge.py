import argparse
import json
import math
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np


def fail(message, output_path=None, logs=None):
    payload = {
        "error": message,
        "logs": logs or [],
    }
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    raise RuntimeError(message)


def write_status(status_path, state, message, **extra):
    if not status_path:
        return
    try:
        payload = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "state": state,
            "message": message,
            **extra,
        }
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except Exception:
        pass


def load_house_diffusion(prototype_path):
    house_diffusion_path = os.path.join(prototype_path, "house_diffusion")
    if not os.path.isdir(house_diffusion_path):
        fail(f"HouseDiffusion repository folder was not found: {house_diffusion_path}")
    if house_diffusion_path not in sys.path:
        sys.path.append(house_diffusion_path)

    import torch
    from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
    from house_diffusion.script_util import create_model_and_diffusion, model_and_diffusion_defaults

    return torch, Polygon, MultiPolygon, GeometryCollection, create_model_and_diffusion, model_and_diffusion_defaults


def bin_to_int(bits):
    return int("".join([str(int(i.cpu().data)) for i in bits]), 2)


def bin_to_int_sample(torch, sample, resolution=256):
    sample_new = torch.zeros([sample.shape[0], sample.shape[1], sample.shape[2], 2], device=sample.device)
    sample[sample < 0] = 0
    sample[sample > 0] = 1
    for i in range(sample.shape[0]):
        for j in range(sample.shape[1]):
            for k in range(sample.shape[2]):
                sample_new[i, j, k, 0] = bin_to_int(sample[i, j, k, :8])
                sample_new[i, j, k, 1] = bin_to_int(sample[i, j, k, 8:])
    return sample_new / (resolution / 2) - 1


def one_hot(torch, length, index):
    out = torch.zeros(length)
    if 0 <= index < length:
        out[index] = 1
    return out


def normalize_boundary(points):
    normalized = []
    for pt in points or []:
        x = float(pt["x"] if isinstance(pt, dict) else pt[0])
        y = float(pt["y"] if isinstance(pt, dict) else pt[1])
        normalized.append({"x": x, "y": y})
    if len(normalized) > 1:
        first = normalized[0]
        last = normalized[-1]
        if abs(first["x"] - last["x"]) < 1e-9 and abs(first["y"] - last["y"]) < 1e-9:
            normalized = normalized[:-1]
    return normalized


def polygon_area(points):
    area = 0.0
    for i, point in enumerate(points):
        nxt = points[(i + 1) % len(points)]
        area += point["x"] * nxt["y"] - nxt["x"] * point["y"]
    return abs(area / 2.0)


def centroid(points):
    if not points:
        return {"x": 0, "y": 0}
    return {
        "x": sum(p["x"] for p in points) / len(points),
        "y": sum(p["y"] for p in points) / len(points),
    }


def room_sequence_from_brief(brief):
    rooms = []
    counters = defaultdict(int)

    def add_room(room_type, model_id, label, required=True, metadata=None):
        counters[label] += 1
        display = label if counters[label] == 1 else f"{label} {counters[label]}"
        rooms.append({
            "type": room_type,
            "modelTypeId": int(model_id),
            "label": display,
            "required": bool(required),
            "metadata": metadata or {},
        })

    brief_rooms = brief.get("rooms", [])
    living = next((room for room in brief_rooms if room.get("type") == "living_room"), None)
    living_metadata = (living.get("metadata") if living else {}) or {}
    add_room("living_room", 1, "Living Room", True, {"anchor": True, **living_metadata})

    for room in brief_rooms:
        room_type = room.get("type")
        if room_type == "living_room" or room.get("unsupportedByModel"):
            continue
        model_type_id = room.get("modelTypeId")
        if model_type_id is None:
            continue
        count = max(0, int(room.get("count", 1)))
        label = room.get("displayLabel") or room_type.replace("_", " ").title()
        for _ in range(count):
            add_room(room_type, model_type_id, label, room.get("required", True), room.get("metadata") or {})

    if not any(room["type"] == "kitchen" for room in rooms):
        add_room("kitchen", 2, "Kitchen", True)
    if not any(room["type"] == "entrance" for room in rooms):
        add_room("entrance", 6, "Entrance", False)

    return rooms[:25]


def room_index_by_type(rooms, room_type):
    for index, room in enumerate(rooms):
        if room["type"] == room_type:
            return index
    return 0


def build_model_kwargs(torch, rooms, adjacency_rules, device):
    max_num_points = 100
    pts_per_room = 4
    total_pts = len(rooms) * pts_per_room
    if total_pts > max_num_points:
        fail(f"Auto Plan supports up to {max_num_points // pts_per_room} generated model rooms in this bridge; requested {len(rooms)}.")

    room_types = torch.zeros(1, max_num_points, 25)
    room_indices = torch.zeros(1, max_num_points, 32)
    corner_indices = torch.zeros(1, max_num_points, 32)
    connections = torch.zeros(1, max_num_points, 2)
    src_key_padding_mask = torch.ones(1, max_num_points)
    door_mask = torch.ones(1, max_num_points, max_num_points)
    self_mask = torch.ones(1, max_num_points, max_num_points)
    gen_mask = torch.ones(1, max_num_points, max_num_points)

    bounds = []
    for r, room in enumerate(rooms):
        start_idx = r * pts_per_room
        bounds.append((start_idx, start_idx + pts_per_room))
        for i in range(pts_per_room):
            pt_idx = start_idx + i
            room_types[:, pt_idx, room["modelTypeId"]] = 1
            room_indices[:, pt_idx, r + 1] = 1
            corner_indices[:, pt_idx, i] = 1
            connections[0, pt_idx] = torch.tensor([pt_idx, start_idx + ((i + 1) % pts_per_room)])

    src_key_padding_mask[:, :total_pts] = 0
    gen_mask[:, :total_pts, :total_pts] = 0

    for i, (a0, a1) in enumerate(bounds):
        self_mask[:, a0:a1, a0:a1] = 0
        if i == 0:
            continue
        # The RPLAN eval preprocessing connects isolated rooms to the living room.
        door_mask[:, a0:a1, bounds[0][0]:bounds[0][1]] = 0
        door_mask[:, bounds[0][0]:bounds[0][1], a0:a1] = 0

    graph_edges = []
    for rule in adjacency_rules or []:
        relationship = rule.get("relationship")
        if relationship == "avoid":
            continue
        a = room_index_by_type(rooms, rule.get("spaceA"))
        b = room_index_by_type(rooms, rule.get("spaceB"))
        if a == b:
            continue
        a0, a1 = bounds[a]
        b0, b1 = bounds[b]
        door_mask[:, a0:a1, b0:b1] = 0
        door_mask[:, b0:b1, a0:a1] = 0
        graph_edges.append([a, 1, b])

    graph = torch.zeros(1, 200, 3)
    for idx, edge in enumerate(graph_edges[:200]):
        graph[0, idx] = torch.tensor(edge)

    kwargs = {
        "room_types": room_types.to(device),
        "corner_indices": corner_indices.to(device),
        "room_indices": room_indices.to(device),
        "src_key_padding_mask": src_key_padding_mask.to(device),
        "connections": connections.to(device),
        "door_mask": door_mask.to(device),
        "self_mask": self_mask.to(device),
        "gen_mask": gen_mask.to(device),
        "syn_room_types": room_types.to(device),
        "syn_corner_indices": corner_indices.to(device),
        "syn_room_indices": room_indices.to(device),
        "syn_src_key_padding_mask": src_key_padding_mask.to(device),
        "syn_connections": connections.to(device),
        "syn_door_mask": door_mask.to(device),
        "syn_self_mask": self_mask.to(device),
        "syn_gen_mask": gen_mask.to(device),
        "graph": graph.to(device),
    }
    return kwargs


def extract_polygons(sample, model_kwargs):
    polys = []
    types = []
    for i in range(sample.shape[1]):
        poly = []
        current_type = None
        for j, point in enumerate(sample[0][i]):
            if model_kwargs["src_key_padding_mask"][i][j] == 1:
                continue
            if j > 0 and (model_kwargs["room_indices"][i, j] != model_kwargs["room_indices"][i, j - 1]).any():
                if len(poly) > 0:
                    polys.append(poly)
                    types.append(current_type)
                poly = []
            pt = point.cpu().data.numpy()
            pt = pt / 2 + 0.5
            pt = pt * 256
            poly.append((float(pt[0]), float(pt[1])))
            current_type = int(np.argmax(model_kwargs["room_types"][i][j].cpu().numpy()))
        if len(poly) > 0:
            polys.append(poly)
            types.append(current_type)
    return polys, types


def largest_polygon(geom, MultiPolygon, GeometryCollection):
    if geom.is_empty:
        return None
    if isinstance(geom, MultiPolygon) or isinstance(geom, GeometryCollection):
        polygons = [g for g in geom.geoms if getattr(g, "area", 0) > 0 and hasattr(g, "exterior")]
        if not polygons:
            return None
        return max(polygons, key=lambda g: g.area)
    if hasattr(geom, "exterior"):
        return geom
    return None


def transform_model_polygon(poly, boundary_points, boundary_polygon, Polygon, MultiPolygon, GeometryCollection):
    xs = [p["x"] for p in boundary_points]
    ys = [p["y"] for p in boundary_points]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    scale_x = (maxx - minx) / 256.0
    scale_y = (maxy - miny) / 256.0
    transformed = [{"x": minx + x * scale_x, "y": miny + y * scale_y} for x, y in poly]

    shapely_poly = Polygon([(p["x"], p["y"]) for p in transformed])
    if not shapely_poly.is_valid:
        shapely_poly = shapely_poly.buffer(0)
    try:
        shapely_poly = shapely_poly.intersection(boundary_polygon)
    except Exception:
        pass
    shapely_poly = largest_polygon(shapely_poly, MultiPolygon, GeometryCollection)
    if shapely_poly is None or shapely_poly.is_empty or shapely_poly.area <= 0.01:
        return None

    coords = list(shapely_poly.exterior.coords)[:-1]
    return [{"x": round(float(x), 4), "y": round(float(y), 4)} for x, y in coords]


def stable_wall_key(a, b):
    pa = (round(a["x"], 3), round(a["y"], 3))
    pb = (round(b["x"], 3), round(b["y"], 3))
    return tuple(sorted([pa, pb]))


def build_walls(boundary_points, rooms):
    walls = []
    wall_keys = set()

    def add_wall(a, b, thickness, wall_type, source, room_id=None):
        if math.hypot(b["x"] - a["x"], b["y"] - a["y"]) < 0.05:
            return None
        key = stable_wall_key(a, b)
        if key in wall_keys:
            return None
        wall_keys.add(key)
        wall = {
            "id": f"ap-wall-{len(walls) + 1:04d}",
            "start": a,
            "end": b,
            "thickness": thickness,
            "wallType": wall_type,
            "source": source,
            "roomIds": [room_id] if room_id else [],
        }
        walls.append(wall)
        return wall

    for room in rooms:
        boundary = room["boundary"]
        for i, point in enumerate(boundary):
            add_wall(point, boundary[(i + 1) % len(boundary)], 0.15, "interior", "model", room["id"])

    for i, point in enumerate(boundary_points):
        add_wall(point, boundary_points[(i + 1) % len(boundary_points)], 0.23, "exterior", "rule", "boundary")

    return walls


def wall_midpoint(wall):
    return {
        "x": (wall["start"]["x"] + wall["end"]["x"]) / 2,
        "y": (wall["start"]["y"] + wall["end"]["y"]) / 2,
    }


def wall_length(wall):
    return math.hypot(wall["end"]["x"] - wall["start"]["x"], wall["end"]["y"] - wall["start"]["y"])


def nearest_wall(walls, point, predicate=lambda wall: True, min_length=0.7):
    best = None
    best_dist = float("inf")
    for wall in walls:
        if not predicate(wall) or wall_length(wall) < min_length:
            continue
        mid = wall_midpoint(wall)
        dist = math.hypot(mid["x"] - point["x"], mid["y"] - point["y"])
        if dist < best_dist:
            best = wall
            best_dist = dist
    return best


def opening_width_for_room(room_type, opening_type):
    if opening_type == "window":
        if room_type == "living_room":
            return 1.8
        if room_type in ["bathroom", "powder_room"]:
            return 0.6
        return 1.2
    if opening_type == "wall_opening":
        return 1.4
    if room_type in ["bathroom", "powder_room", "storage", "utility", "laundry"]:
        return 0.75
    return 0.9


def build_openings(walls, rooms, brief):
    openings = []
    exterior_walls = [wall for wall in walls if wall.get("wallType") == "exterior"]
    interior_walls = [wall for wall in walls if wall.get("wallType") != "exterior"]
    living = next((room for room in rooms if room["type"] == "living_room"), rooms[0] if rooms else None)
    living_center = centroid(living["boundary"]) if living else {"x": 0, "y": 0}
    kitchen_open = any(room.get("type") == "kitchen" and room.get("kitchenType") == "open" for room in brief.get("rooms", []))

    entrance = next((room for room in rooms if room["type"] in ["entrance", "foyer"]), None)
    main_wall = nearest_wall(exterior_walls, centroid(entrance["boundary"]) if entrance else living_center, min_length=1.2)
    if main_wall:
        openings.append({
            "id": f"ap-opening-{len(openings) + 1:04d}",
            "type": "door",
            "hostWallId": main_wall["id"],
            "position": 0.12,
            "width": 1.0,
            "height": 2.1,
            "swing": "in",
            "source": "rule",
            "roomId": entrance["id"] if entrance else None,
            "metadata": {"subType": "main"},
        })

    for room in rooms:
        if room["type"] in ["living_room", "entrance", "foyer"]:
            continue
        center = centroid(room["boundary"])
        host = nearest_wall(interior_walls, center, min_length=0.9)
        if not host:
            host = nearest_wall(walls, center, min_length=0.9)
        if not host:
            continue
        opening_type = "door"
        metadata = {}
        if room["type"] == "kitchen" and kitchen_open:
            opening_type = "wall_opening"
        elif room["type"] in ["balcony", "terrace"]:
            opening_type = "door"
            metadata["subType"] = "sliding"

        openings.append({
            "id": f"ap-opening-{len(openings) + 1:04d}",
            "type": opening_type,
            "hostWallId": host["id"],
            "position": 0.5,
            "width": opening_width_for_room(room["type"], opening_type),
            "height": 2.1,
            "swing": "in",
            "source": "rule",
            "roomId": room["id"],
            "metadata": metadata,
        })

    window_slots = [0.28, 0.5, 0.72]
    exterior_sorted = sorted(exterior_walls, key=wall_length, reverse=True)
    window_rooms = [room for room in rooms if room["type"] not in ["entrance", "foyer", "corridor"]]
    for index, room in enumerate(window_rooms[: max(1, len(exterior_sorted) * 2)]):
        if not exterior_sorted:
            break
        wall = exterior_sorted[index % len(exterior_sorted)]
        openings.append({
            "id": f"ap-opening-{len(openings) + 1:04d}",
            "type": "window",
            "hostWallId": wall["id"],
            "position": window_slots[index % len(window_slots)],
            "width": opening_width_for_room(room["type"], "window"),
            "height": 1.1 if room["type"] not in ["bathroom", "powder_room"] else 0.6,
            "sillHeight": 0.9 if room["type"] not in ["bathroom", "powder_room"] else 1.5,
            "source": "rule",
            "roomId": room["id"],
        })

    return openings


def create_model(torch, model_path, device, create_model_and_diffusion, model_and_diffusion_defaults):
    defaults = model_and_diffusion_defaults()
    defaults["dataset"] = "rplan"
    defaults["num_channels"] = 512
    defaults["analog_bit"] = False
    defaults["input_channels"] = 18
    defaults["condition_channels"] = 89
    defaults["out_channels"] = 2
    defaults["use_unet"] = False
    model, diffusion = create_model_and_diffusion(**defaults)
    state = torch.load(model_path, map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model, diffusion


def generate(payload, prototype_path, model_path, status_path=None):
    write_status(status_path, "importing_dependencies", "Importing HouseDiffusion, Torch, and Shapely dependencies.", modelPath=model_path, prototypePath=prototype_path)
    torch, Polygon, MultiPolygon, GeometryCollection, create_model_and_diffusion, model_and_diffusion_defaults = load_house_diffusion(prototype_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logs = [
        {"level": "info", "code": "MODEL_PATH", "message": f"Using HouseDiffusion model weights: {model_path}"},
        {"level": "info", "code": "PROTOTYPE_PATH", "message": f"Using prototype code path: {prototype_path}"},
        {"level": "info", "code": "DEVICE", "message": f"Using inference device: {device}"},
    ]

    brief = payload.get("normalizedBrief") or {}
    boundary = payload["boundary"]
    boundary_points = normalize_boundary(boundary.get("points"))
    if len(boundary_points) < 3:
        fail("Auto Plan boundary must contain at least three points.")
    boundary_polygon = Polygon([(p["x"], p["y"]) for p in boundary_points])
    if not boundary_polygon.is_valid:
        boundary_polygon = boundary_polygon.buffer(0)
    if boundary_polygon.is_empty or boundary_polygon.area <= 0.01:
        fail("Auto Plan boundary is invalid or has no usable area.")

    rooms_for_model = room_sequence_from_brief(brief)
    logs.append({"level": "info", "code": "ROOM_SEQUENCE", "message": ", ".join([f"{r['label']}:{r['modelTypeId']}" for r in rooms_for_model])})
    write_status(status_path, "loading_model", "Loading HouseDiffusion model weights.", modelPath=model_path, prototypePath=prototype_path, device=str(device), roomCountRequested=len(rooms_for_model))

    start = time.time()
    model, diffusion = create_model(torch, model_path, device, create_model_and_diffusion, model_and_diffusion_defaults)
    write_status(status_path, "building_tensors", "Building RPLAN/HouseDiffusion graph tensors from normalized brief.", modelPath=model_path, device=str(device), roomCountRequested=len(rooms_for_model))
    model_kwargs = build_model_kwargs(torch, rooms_for_model, brief.get("adjacencyRules", []), device)
    write_status(status_path, "running_diffusion", "Running reverse diffusion. CPU runs may take several minutes.", modelPath=model_path, device=str(device), roomCountRequested=len(rooms_for_model), expectedSteps=1000)
    sample = diffusion.p_sample_loop(
        model,
        (1, 2, 100),
        clip_denoised=True,
        model_kwargs=model_kwargs,
        analog_bit=False,
        progress=False,
    )
    write_status(status_path, "extracting_geometry", "Extracting room polygons, walls, and openings from model output.", modelPath=model_path, device=str(device), elapsedSeconds=round(time.time() - start, 2))
    if sample.dim() == 4:
        sample = sample.permute([0, 1, 3, 2])
    polys, type_ids = extract_polygons(sample, model_kwargs)
    logs.append({"level": "info", "code": "INFERENCE_DONE", "message": f"HouseDiffusion returned {len(polys)} polygons in {time.time() - start:.2f}s."})

    rooms = []
    type_occurrence = defaultdict(int)
    sequence_by_model_id = defaultdict(list)
    for room in rooms_for_model:
        sequence_by_model_id[room["modelTypeId"]].append(room)

    for poly, model_type_id in zip(polys, type_ids):
        if model_type_id is None:
            continue
        transformed = transform_model_polygon(poly, boundary_points, boundary_polygon, Polygon, MultiPolygon, GeometryCollection)
        if not transformed or len(transformed) < 3:
            continue
        type_occurrence[model_type_id] += 1
        requested = sequence_by_model_id.get(model_type_id, [])
        requested_room = requested[min(type_occurrence[model_type_id] - 1, max(0, len(requested) - 1))] if requested else None
        label = requested_room["label"] if requested_room else f"Room {model_type_id}"
        room_type = requested_room["type"] if requested_room else f"model_{model_type_id}"
        room = {
            "id": f"ap-room-{len(rooms) + 1:04d}",
            "type": room_type,
            "label": label,
            "boundary": transformed,
            "area": polygon_area(transformed),
            "source": "model",
            "modelTypeId": int(model_type_id),
            "metadata": requested_room.get("metadata", {}) if requested_room else {},
        }
        rooms.append(room)

    if not rooms:
        fail("HouseDiffusion produced no usable room polygons inside the submitted boundary.")

    walls = build_walls(boundary_points, rooms)
    openings = build_openings(walls, rooms, brief)
    nodes = []
    for room in rooms:
        c = centroid(room["boundary"])
        nodes.append({
            "id": f"ap-node-{len(nodes) + 1:04d}",
            "type": room["type"],
            "label": room["label"],
            "x": c["x"],
            "y": c["y"],
            "radius": max(0.45, min(2.2, math.sqrt(max(room.get("area") or 1, 1) / math.pi) * 0.25)),
            "areaHint": room.get("area"),
            "required": True,
            "source": "model",
            "locked": room["type"] == "living_room",
            "metadata": {"roomId": room["id"], "modelTypeId": room.get("modelTypeId")},
        })

    metadata = {
        "generator": "Auto Plan",
        "feature": "AI Residential Floorplan Generator",
        "model": "house_diffusion",
        "modelWeightsPath": model_path,
        "sourcePrototypePath": prototype_path,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "inferenceStage": payload.get("stage") or "nodes",
        "diagnostics": {
            "device": str(device),
            "roomCountRequested": len(rooms_for_model),
            "roomPolygonsReturned": len(polys),
            "roomPolygonsUsed": len(rooms),
            "openingsAreRuleBased": True,
        },
    }

    warnings = []
    if len(rooms) < len(rooms_for_model):
        warnings.append(f"Model returned {len(rooms)} usable rooms for {len(rooms_for_model)} requested model rooms.")
    unsupported = brief.get("unsupportedRequests") or []
    for item in unsupported:
        warnings.append(f"Unsupported request preserved as metadata: {item.get('requestedType')} -> {item.get('mappedTo') or 'metadata only'}.")

    result = {
        "payload": {
            "boundary": {
                **boundary,
                "points": boundary_points,
                "area": boundary.get("area") or polygon_area(boundary_points),
            },
            "brief": brief,
            "nodes": nodes,
            "walls": walls,
            "openings": openings,
            "rooms": rooms,
            "metadata": metadata,
        },
        "warnings": warnings,
        "logs": logs,
    }
    write_status(status_path, "complete", "Auto Plan inference finished successfully.", modelPath=model_path, device=str(device), roomCount=len(rooms), wallCount=len(walls), openingCount=len(openings), elapsedSeconds=round(time.time() - start, 2))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--prototype", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--status", default=os.environ.get("AUTO_PLAN_STATUS_PATH"))
    args = parser.parse_args()

    if not os.path.exists(args.model):
        fail(f"Auto Plan model file was not found. Expected model path: {args.model}", args.output)

    with open(args.input, "r", encoding="utf-8-sig") as f:
        payload = json.load(f)

    result = generate(payload, args.prototype, args.model, args.status)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"Auto Plan inference complete. Rooms={len(result['payload']['rooms'])}, walls={len(result['payload']['walls'])}, openings={len(result['payload']['openings'])}")


if __name__ == "__main__":
    main()
