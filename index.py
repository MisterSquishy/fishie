import io
import json
import logging
import os
import random
import tempfile
import time

import requests
import sentry_sdk
from PIL import Image
from instagrapi import Client
from instagrapi.exceptions import LoginRequired

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sentry_sdk.init(
    dsn=os.environ.get('SENTRY_DSN'),
    traces_sample_rate=1.0,
)

DEZGO_API_URL = 'https://api.dezgo.com/text-inpainting'
BIRDIE_PK = 49451361619
FISHIE_PK = 68845303124
ROYGBIV = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']


def ig_login() -> Client:
    cl = Client()
    cl.delay_range = [1, 3]
    username = os.environ['IG_USERNAME']
    password = os.environ['IG_PASSWORD']
    settings_json = os.environ.get('IG_SETTINGS')

    if settings_json:
        cl.set_settings(json.loads(settings_json))
        cl.login(username, password)
        try:
            cl.get_timeline_feed()
            logger.info('session valid')
        except LoginRequired:
            logger.info('session expired, doing fresh login')
            old = cl.get_settings()
            cl.set_settings({})
            cl.set_uuids(old['uuids'])
            cl.login(username, password)
    else:
        logger.info('no saved session, logging in fresh')
        cl.login(username, password)

    return cl


def get_most_recent_fish_caption(cl: Client) -> str:
    medias = cl.user_medias_v1(FISHIE_PK, amount=1)
    return medias[0].caption_text or '' if medias else ''


def get_most_recent_bird(cl: Client, most_recent_caption: str) -> dict:
    medias = cl.user_medias_v1(BIRDIE_PK, amount=1)
    most_recent = medias[0]
    caption = most_recent.caption_text or ''

    if caption == most_recent_caption:
        logger.info(f'skipping image fetch for {caption}')
        return {'image': None, 'caption': caption, 'url': ''}

    image_url = str(most_recent.thumbnail_url)
    logger.info(f'getting most recent bird from {image_url}')
    resp = requests.get(image_url, timeout=30)
    resp.raise_for_status()
    return {
        'image': resp.content,
        'caption': caption,
        'url': f'https://www.instagram.com/p/{most_recent.code}/',
    }


def bird_to_fish(image: bytes) -> bytes:
    excluded_colors = random.sample(ROYGBIV, 2)
    negative_prompt = ', '.join(['gross'] + excluded_colors)
    logger.info(f'converting bird to fish with negative prompt: {negative_prompt}')

    resp = requests.post(
        DEZGO_API_URL,
        data={'mask_prompt': 'bird', 'prompt': 'fish', 'negative_prompt': negative_prompt},
        files={'init_image': ('image.jpg', image, 'image/jpeg')},
        headers={'X-Dezgo-Key': os.environ['X_DEZGO_KEY']},
        timeout=60,
    )
    resp.raise_for_status()

    out = io.BytesIO()
    Image.open(io.BytesIO(resp.content)).convert('RGB').save(out, format='JPEG', quality=100)
    return out.getvalue()


def post_to_insta(cl: Client, image: bytes, caption: str, bird_url: str):
    logger.info('posting to IG')
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(image)
        temp_path = f.name
    try:
        media = cl.photo_upload(temp_path, caption=caption)
        logger.info(f'posted to IG: https://www.instagram.com/p/{media.code}/')
        cl.media_comment(media.pk, f'This is {bird_url}')
    finally:
        os.unlink(temp_path)


def handler(*_):
    cl = ig_login()

    time.sleep(random.uniform(0, 10))
    most_recent_caption = get_most_recent_fish_caption(cl)
    logger.info(f'most recent fish caption is {most_recent_caption}')

    time.sleep(random.uniform(0, 10))
    bird = get_most_recent_bird(cl, most_recent_caption)

    if bird['caption'] == most_recent_caption:
        logger.info('short-circuiting, we already fished the most recent bird')
    else:
        logger.info(f"most recent bird caption is {bird['caption']}")
        time.sleep(random.uniform(0, 10))
        fish = bird_to_fish(bird['image'])
        post_to_insta(cl, fish, bird['caption'], bird['url'])

