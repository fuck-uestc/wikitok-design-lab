"""Smoke tests for the standalone prototypes. Requires Playwright + Chromium.
Uses set_content rather than relying on file:// or localhost access.
Run: python src/qa.py [--browser /path/to/chromium]
No live API requests or real OS sharing actions are made.
"""
import argparse
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--browser", default=shutil.which("chromium") or shutil.which("google-chrome"))
parser.add_argument("--part", choices=["all","functional","layout-a","layout-b"], default="all")
args = parser.parse_args()
reports = []
screens = ROOT / "previews"
screens.mkdir(exist_ok=True)

def state(page):
    return page.evaluate("window.__DEMO__.getState()")

def settle(page):
    page.wait_for_timeout(120)

def assert_ok(condition, label):
    if not condition:
        raise AssertionError(label)

with sync_playwright() as p:
    options = {"headless": True, "args": ["--no-sandbox"]}
    if args.browser:
        options["executable_path"] = args.browser
    browser = p.chromium.launch(**options)
    for name, first in ([("a-margin", "mobius"), ("b-drift", "hubble")] if args.part in ("all","functional") else []):
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.set_default_timeout(4500)
        print("Testing", name, flush=True)
        errors, requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: requests.append(request.url) if request.url.startswith(("http:", "https:")) else None)
        page.emulate_media(reduced_motion="reduce")
        page.set_content((ROOT / f"demo-{name}.html").read_text(), wait_until="load")
        settle(page)
        checks = []
        assert_ok(state(page)["current"] == first and state(page)["count"] == 6, "initial state")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("initial state: six entries")
        page.keyboard.press("j")
        settle(page)
        assert_ok(state(page)["active"] == 1, "j next")
        page.keyboard.press("k")
        settle(page)
        assert_ok(state(page)["current"] == first, "k previous")
        page.keyboard.press("ArrowDown")
        settle(page)
        assert_ok(state(page)["active"] == 1, "arrow next")
        page.keyboard.press("ArrowUp")
        settle(page)
        assert_ok(state(page)["active"] == 0, "arrow previous")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("J/K and arrow navigation")
        page.mouse.move(800, 480)
        page.mouse.wheel(0, 850)
        page.wait_for_timeout(700)
        assert_ok(state(page)["active"] > 0, "native wheel scroll")
        page.locator('[data-action="home"]').first.click()
        settle(page)
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("native wheel scroll and home")
        page.keyboard.press("b")
        assert_ok(first in state(page)["saved"], "save")
        page.locator('[data-action="saved"]:visible').first.click()
        assert_ok(page.locator("#library[open]").count() == 1, "saved opens")
        assert_ok(page.locator("#results .result-item").count() == 1, "saved count")
        page.locator('[data-action="library-all"]').click()
        assert_ok(page.locator("#results .result-item").count() == 6, "library all tab")
        page.locator('[data-action="library-saved"]').click()
        assert_ok(page.locator("#results .result-item").count() == 1, "library saved tab")
        page.keyboard.press("Escape")
        settle(page)
        page.keyboard.press("b")
        assert_ok(first not in state(page)["saved"], "unsave")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("save / unsave / collection tabs (in-session fallback)")
        page.keyboard.press("/")
        assert_ok(page.locator("#query").evaluate("(e)=>e===document.activeElement"), "search focuses")
        page.locator("#query").fill("coffee")
        assert_ok(page.locator("#results .result-item").count() == 1, "search filter")
        page.locator('#results [data-id="coffee"]').click()
        settle(page)
        assert_ok(state(page)["current"] == "coffee", "search result opens entry")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("search and jump to result")
        page.locator('.slide:not([inert]) [data-action="read"]').first.click()
        assert_ok(page.locator("#reader[open]").count() == 1, "reader opens")
        assert_ok(page.locator('#reader a[target="_blank"]').count() >= 2, "reader source links")
        page.keyboard.press("Escape")
        settle(page)
        assert_ok(page.locator("#reader[open]").count() == 0 and state(page)["current"] == "coffee", "reader closes to same entry")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("reader, source links and return position")
        page.locator('[data-action="filter"][data-category="\u5b87\u5b99"]').click()
        settle(page)
        assert_ok(state(page)["count"] == 2, "space filter")
        page.locator('[data-action="filter"]').first.click()
        settle(page)
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("category filter and reset")
        before = state(page)["current"]
        page.locator('[data-action="shuffle"]:visible').first.click()
        settle(page)
        assert_ok(state(page)["current"] != before, "shuffle excludes current")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("random next")
        page.locator('#dots [data-id="theseus"]').click()
        settle(page)
        assert_ok(state(page)["current"] == "theseus", "no-image entry jump")
        assert_ok(page.locator('.slide:not([inert]) .no-image').count() == 1, "no-image layout")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("no-image fallback entry")
        page.locator(f'#dots [data-id="{first}"]').click()
        settle(page)
        page.locator('[data-action="share"]:visible').first.click()
        assert_ok(page.locator("#sharebox[open]").count() == 1, "share fallback")
        assert_ok(page.locator("#share-url").input_value().startswith("https://"), "share source URL")
        page.keyboard.press("Escape")
        settle(page)
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("share fallback exposes HTTPS article URL")
        if name == "a-margin":
            page.locator('.slide:not([inert]) [data-action="image"]').click()
            assert_ok(page.locator("#lightbox[open]").count() == 1, "lightbox")
            page.keyboard.press("Escape")
            print("  checkpoint", len(checks)+1, flush=True)
            checks.append("full-image lightbox")
        else:
            page.keyboard.press("f")
            assert_ok(page.locator(".focus-mode").count() == 1, "focus mode")
            assert_ok(page.locator(".immersive-header").evaluate("(e)=>e.inert"), "focus inert header")
            page.keyboard.press("Escape")
            assert_ok(page.locator(".focus-mode").count() == 0, "focus exit")
            print("  checkpoint", len(checks)+1, flush=True)
            checks.append("focus view and escape")
        settle(page)
        page.locator('#dots [data-id="coffee"]').click()
        settle(page)
        page.set_viewport_size({"width": 390, "height": 844})
        settle(page)
        assert_ok(state(page)["current"] == "coffee", "resize retains current")
        page.locator('.mobile-only[data-action="saved"]').click()
        assert_ok(page.locator("#library[open]").count() == 1, "mobile saved access")
        page.keyboard.press("Escape")
        settle(page)
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("resize preserves entry; mobile collection access")
        # Simulate one image load failure without making an external request.
        page.locator('.slide:not([inert]) img').first.evaluate("(e)=>e.dispatchEvent(new Event('error'))")
        assert_ok(page.locator('.slide:not([inert]) .no-image').count() == 1, "image error fallback")
        print("  checkpoint", len(checks)+1, flush=True)
        checks.append("simulated image error fallback")
        assert_ok(not errors, f"JS errors: {errors}")
        assert_ok(not requests, f"external requests: {requests}")
        reports.append({"prototype": name, "checks": checks, "javascript_errors": errors, "external_requests": requests})
        page.close()

    # Verify every entry, not just the selected hero, at multiple viewport sizes.
    layouts = []
    for name in (["a-margin","b-drift"] if args.part == "all" else ["a-margin"] if args.part == "layout-a" else ["b-drift"] if args.part == "layout-b" else []):
        for label, width, height in [
            ("desktop",1440,900), ("laptop",1280,720), ("tablet",768,1024),
            ("mobile",390,844), ("small-mobile",360,640), ("tiny-mobile",320,568)
        ]:
            page = browser.new_page(viewport={"width":width,"height":height}, device_scale_factor=1)
            page.set_default_timeout(4500)
            print("Layout", name, label, flush=True)
            page.emulate_media(reduced_motion="reduce")
            page.set_content((ROOT / f"demo-{name}.html").read_text(), wait_until="load")
            settle(page)
            if label in ("desktop","mobile"):
                page.screenshot(path=str(screens / f"{name}-{label}.png"))
            assert_ok(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"page overflow {name}/{label}")
            ids = page.locator(".slide").evaluate_all("(es)=>es.map(e=>e.dataset.id)")
            for id_ in ids:
                # Dot controls are intentionally hidden on mobile DRIFT.
                if name == "b-drift" and width <= 700:
                    page.locator(f'#filmstrip [data-id="{id_}"]').evaluate("(e)=>e.click()")
                else:
                    page.locator(f'#dots [data-id="{id_}"]').evaluate("(e)=>e.click()")
                settle(page)
                assert_ok(state(page)["current"] == id_, f"jump {id_} {name}/{label}")
                geometry = page.locator(".slide:not([inert])").evaluate("""el => {
                    const title=el.querySelector('h1').getBoundingClientRect();
                    const action=el.querySelector('.story-actions,.immersive-actions').getBoundingClientRect();
                    const feed=document.querySelector('#feed').getBoundingClientRect();
                    return {title:{x:title.x,y:title.y,right:title.right,bottom:title.bottom},
                            action:{x:action.x,y:action.y,right:action.right,bottom:action.bottom},
                            feed:{x:feed.x,y:feed.y,right:feed.right,bottom:feed.bottom}};
                }""")
                assert_ok(geometry["title"]["x"] >= 0 and geometry["title"]["right"] <= width+1, f"title horizontal overflow {name}/{label}/{id_}")
                assert_ok(geometry["title"]["y"] >= -1, f"title top clipped {name}/{label}/{id_}")
                assert_ok(geometry["action"]["bottom"] <= geometry["feed"]["bottom"]+1, f"action clipped {name}/{label}/{id_}")
            layouts.append({"prototype":name,"viewport":f"{width}x{height}","entries_checked":len(ids),"page_overflow":False})
            page.close()
    browser.close()

output = {"functional":reports,"layouts":layouts,"notes":[
    "Inline rendering of fully bundled HTML in headless Chromium.",
    "Real localStorage persistence, OS share UI, real mobile browsers and backend requests were not tested.",
    "Bookmarks were tested using the implemented in-memory fallback when storage was unavailable.",
    "No external HTTP resources were requested by the prototypes during the test."
]}
(ROOT / "previews" / f"qa-{args.part}.json").write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n")
print(json.dumps(output,indent=2,ensure_ascii=False))
