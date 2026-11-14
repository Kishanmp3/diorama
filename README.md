# Diorama

Paste a Google Maps link and get the place as a tabletop 3D model, built from real OpenStreetMap data.

## Features
- **Any input**: full Google Maps URLs (`@lat,lng`, `!3d…!4d…`, `?q=`), `maps.app.goo.gl` short links (resolved server-side), addresses and landmarks (Nominatim), decimal or DMS coordinates.
- **Real data**: buildings with real heights (`height`, `building:levels`, `min_height`, `building:part`), roads by class and width, rail, rivers and lakes, parks and woods, beaches, parking, mapped trees. Everything is clipped to a clean circle (Sutherland-Hodgman for polygons, circle intersection for lines).
- **Model**: walls and roofs as separate meshes, per-building tint, a wooden turntable plinth, soft shadows, a time-of-day sun, tilt-shift blur, bloom.
- **Styles**: Clay, Blueprint, Night (lit windows), Toy town, First snow, Wireframe, plus "Restyle with words" (Claude invents a palette).
- **Guided tour**: Claude picks 4-5 stops from the actual model (tallest buildings, named landmarks, parks, water, main streets) and narrates while the camera flies between them. Without a key, a simple data-driven tour runs instead.
- **Hover** any building for name, type, height and floors.
- **Export**: 2400px PNG, GLB (Blender, 3D printing slicers via conversion), shareable link (`#at=lat,lng,radius,style`).

## Run locally
```bash
cp .env.example .env.local
node dev-server.mjs   # http://localhost:3000
```

## Deploy
```bash
vercel --prod
vercel env add ANTHROPIC_API_KEY   # optional
```

Map data © OpenStreetMap contributors (ODbL). Overpass is queried directly from the browser with two mirror fallbacks; please keep the radius limit to be kind to the public servers.
