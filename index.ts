import * as Sentry from '@sentry/serverless';
import axios from 'axios';
import 'dotenv';
import FormData from "form-data";
import { instagramIdToUrlSegment } from 'instagram-id-to-url-segment';
import { IgApiClient } from 'instagram-private-api';
import pngToJpeg from 'png-to-jpeg';
import { env } from 'process';

Sentry.AWSLambda.init({
  dsn: env['SENTRY_DSN'],
  tracesSampleRate: 1.0,
});

const DEZGO_API_URL = 'https://api.dezgo.com/text-inpainting'
const BIRDIE_PK = 49451361619
const FISHIE_PK = 68845303124

const ROYGBIV = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"]

module.exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  const ig = new IgApiClient();
  ig.state.generateDevice(env.IG_USERNAME!);
  sleep(Math.random() * 10_000) // pause for 0-10 seconds so instagram doesnt get bad vibes
  console.log(`logging in to IG`)
  await ig.account.login(env.IG_USERNAME!, env.IG_PASSWORD!);
  sleep(Math.random() * 10_000) // pause for 0-10 seconds so instagram doesnt get bad vibes
  const mostRecentCaption = await getMostRecentFishCaption(ig)
  console.log(`most recent fish caption is ${mostRecentCaption}`)
  sleep(Math.random() * 10_000) // pause for 0-10 seconds so instagram doesnt get bad vibes
  const bird = await getMostRecentBird(ig, mostRecentCaption)
  if (bird.caption === mostRecentCaption) {
    console.log("short-circuiting, we already fished the most recent bird")
    return
  } else {
    console.log(`most recent bird caption is ${bird.caption}`)
  }
  const fish = await birdToFish(bird.image)
  await postToInsta(ig, fish, bird.caption, bird.url)
  await ig.account.logout()
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getMostRecentFishCaption = async (ig: IgApiClient): Promise<string> => {
  const fishieFeed = ig.feed.user(FISHIE_PK);
  const fishiePosts = await fishieFeed.items();
  return fishiePosts?.[0]?.caption?.text ?? ''
}

const getMostRecentBird = async (ig: IgApiClient, mostRecentCaption: string): Promise<{ image: Buffer, caption: string, url: string }> => {
  const birdieFeed = ig.feed.user(BIRDIE_PK);
  const birdiePosts = await birdieFeed.items();
  const mostRecentPost = birdiePosts[0];
  const caption = mostRecentPost.caption!.text
  if (caption === mostRecentCaption) {
    // optimization; dont fetch bird image if we already fished it
    console.log(`skipping image fetch for ${caption}`)
    return { image: Buffer.of(), caption, url: '' }
  }
  const mostRecentPostImageUrl = mostRecentPost.image_versions2.candidates[0].url
  console.log(`getting most recent bird from ${mostRecentPostImageUrl}`)
  const response = await axios.get(mostRecentPostImageUrl, { responseType: 'arraybuffer' })
  const vanityId = instagramIdToUrlSegment(mostRecentPost.pk)
  return { image: Buffer.from(response.data, 'binary'), caption, url: `https://www.instagram.com/p/${vanityId}/` }
}

const birdToFish = async (image: Buffer): Promise<Buffer> => {
  const formData = new FormData();
  formData.append('mask_prompt', 'bird');
  formData.append('prompt', 'fish');
  const excludedColors = ROYGBIV.sort(() => 0.5 - Math.random()).slice(0, 2)
  const negativePrompt = ['gross', 'uncomfortable', 'disfigured', ...excludedColors].join(", ")
  formData.append('negative_prompt', negativePrompt)
  formData.append('init_image', image, { filename: 'image.jpg', contentType: 'image/jpeg' })

  console.log(`converting bird to fish with negative prompt: ${negativePrompt}`)
  const response = await axios.postForm(DEZGO_API_URL, formData, {
    headers: {
      "X-Dezgo-Key": env['X_DEZGO_KEY'],
    },
    timeout: 60000,
    responseType: 'arraybuffer',
  })

  return await pngToJpeg({ quality: 100 })(response.data)
}

const postToInsta = async (ig: IgApiClient, image: Buffer, caption: string, birdUrl: string) => {
  console.log(`posting to IG`)
  const photo = await ig.publish.photo({
    file: image,
    caption,
  });
  console.log(`posted to IG: https://www.instagram.com/p/${photo.media.id}/ (${photo.media.image_versions2.candidates?.[0].url})`)
  ig.media.comment({
    mediaId: photo.media.id,
    text: `This is ${birdUrl}`,
  })
}

