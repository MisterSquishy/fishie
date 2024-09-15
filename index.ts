import axios from 'axios';
import 'dotenv';
import FormData from "form-data";
import { IgApiClient } from 'instagram-private-api';
import pngToJpeg from 'png-to-jpeg';
import { env } from 'process';

const DEZGO_API_URL = 'https://api.dezgo.com/text-inpainting'
const BIRDIE_PK = 49451361619
const FISHIE_PK = 68845303124

module.exports.handler = async (event) => {
  const ig = new IgApiClient();
  ig.state.generateDevice(env.IG_USERNAME!);
  const mostRecentCaption = await getMostRecentFishCaption(ig)
  console.log(`most recent fish caption is ${mostRecentCaption}`)
  const bird = await getMostRecentBird(ig, mostRecentCaption)
  if (bird.caption === mostRecentCaption) {
    console.log("short-circuiting, we already fished the most recent bird")
    return
  } else {
    console.log(`most recent bird caption is ${bird.caption}`)
  }
  console.log(`logging in to IG`)
  await ig.account.login(env.IG_USERNAME!, env.IG_PASSWORD!);
  const fish = await birdToFish(bird.image)
  await postToInsta(ig, fish, bird.caption)
};

const getMostRecentFishCaption = async (ig: IgApiClient): Promise<string> => {
  const fishieFeed = ig.feed.user(FISHIE_PK);
  const fishiePosts = await fishieFeed.items();
  return fishiePosts?.[0]?.caption?.text ?? ''
}

const getMostRecentBird = async (ig: IgApiClient, mostRecentCaption: string): Promise<{ image: Buffer, caption: string }> => {
  const birdieFeed = ig.feed.user(BIRDIE_PK);
  const birdiePosts = await birdieFeed.items();
  const mostRecentPostUrl = birdiePosts[0].image_versions2.candidates[0].url
  const caption = birdiePosts[0].caption!.text
  if (caption === mostRecentCaption) {
    // optimization; dont fetch bird image if we already fished it
    console.log(`skipping image fetch for ${caption}`)
    return { image: Buffer.of(), caption }
  }
  console.log(`getting most recent bird from ${mostRecentPostUrl}`)
  const response = await axios.get(mostRecentPostUrl, { responseType: 'arraybuffer' })
  return { image: Buffer.from(response.data, 'binary'), caption }
}

const birdToFish = async (image: Buffer): Promise<Buffer> => {
  const formData = new FormData();
  formData.append('mask_prompt', 'bird');
  formData.append('prompt', 'fish');
  formData.append('negative_prompt', 'poorly drawn tail')
  formData.append('init_image', image, { filename: 'image.jpg', contentType: 'image/jpeg' })

  console.log(`converting bird to fish`)
  const response = await axios.postForm(DEZGO_API_URL, formData, {
    headers: {
      "X-Dezgo-Key": env['X_DEZGO_KEY'],
    },
    timeout: 60000,
    responseType: 'arraybuffer',
  })

  return await pngToJpeg({ quality: 100 })(response.data)
}

const postToInsta = async (ig: IgApiClient, image: Buffer, caption: string) => {
  console.log(`posting to IG`)
  await ig.publish.photo({
    file: image,
    caption,
  });
}

