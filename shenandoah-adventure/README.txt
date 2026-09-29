SHENANDOAH JUNIOR EXPLORER ADVENTURE (built with nps_mcp)
=========================================================

NEW: The site now opens with a kid-friendly choose-your-own-adventure down
Skyline Drive: 16 scenes, 4 endings, 7 badges, a road that fills in with
photos of every stop you visit, and a trip log. Real park photos, mile
markers, weather and alerts from your MCP data show up inside the story.
Everything from before (map, 3D, planner, etc.) is below it as the
"Explorer's field guide".

QUICK UPDATE: only site-template.html changed. Drop it into the nps_mcp
folder you've been using (replace the old one), then run:
    node build-site.mjs
    open ../shenandoah.html

To edit the story: open site-template.html in VS Code and search for
"const SCENES". Each scene has a title, text, a Ranger Ridge fact and
choices that point to other scenes.

--- Details from v2 below ---


What's new
  - Live alerts banner, live weather forecast, park webcams
  - "Skyline Drive, mile by mile": scroll to drive the road north to south
  - Topographic map with trails, viewpoints, waterfalls, campgrounds and more
  - 3D terrain model of the Blue Ridge you can spin around
  - Season switcher (spring / summer / fall / winter) that re-themes the whole site
  - Trip planner that builds a half-day, full-day or weekend itinerary
  - Things to do, visitor centers, camping, events and a photo gallery

The MCP server (src/index.ts) has 8 new tools:
  park-alerts, park-campgrounds, park-visitor-centers, park-things-to-do,
  park-events, park-webcams, park-places   (all from the NPS API, same key)
  weather-forecast   (National Weather Service, no key needed)
  trail-features     (OpenStreetMap trails & viewpoints, no key needed)

UPDATING YOUR EXISTING FOLDER (keeps your .env)
  1. Copy these 3 files from this zip into Desktop/shenandoah-site/nps_mcp,
     replacing the old ones:
        nps_mcp/src/index.ts        -> goes in the src folder
        nps_mcp/build-site.mjs
        nps_mcp/site-template.html  (new file)
  2. In Terminal:
        cd ~/Desktop/shenandoah-site/nps_mcp
        npm run build
        node build-site.mjs
        open ../shenandoah.html

Tip: to change the design, edit site-template.html, then run
     node build-site.mjs again. Your data gets poured into the template.

PUBLISHING FOR FREE WITH GITHUB PAGES
  1. Make a free account at github.com and create a new PUBLIC repository
     (for example "shenandoah").
  2. Rename a copy of shenandoah.html to index.html.
  3. In the repository, click "Add file" > "Upload files", drag in index.html,
     and click "Commit changes".
  4. Go to Settings > Pages. Under "Branch", choose "main" and "/ (root)", Save.
  5. After a minute or two your site is live at
        https://YOUR-USERNAME.github.io/shenandoah/
  Never upload the .env file (it holds your API key). index.html does not contain it.
