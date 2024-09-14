import axios from 'axios';
import 'dotenv';
import FormData from "form-data";
import { createReadStream } from 'fs';
import { IgApiClient } from 'instagram-private-api';
import pngToJpeg from 'png-to-jpeg';
import { env } from 'process';

const DEZGO_API_URL = 'https://api.dezgo.com/text-inpainting'

module.exports.handler = async (event) => {
  const formData = new FormData();
  formData.append('mask_prompt', 'bird');
  formData.append('prompt', 'fish');
  formData.append('init_image', createReadStream("bird.jpeg"))

  const response = await axios.postForm(DEZGO_API_URL, formData, {
    headers: {
      "X-Dezgo-Key": env['X-Dezgo-Key'],
    },
    timeout: 60000,
    responseType: 'arraybuffer',
  })

  const jpg = await pngToJpeg({ quality: 100 })(response.data)
  await postToInsta(jpg, 'test')
};

const postToInsta = async (image: Buffer, caption: string) => {
  const ig = new IgApiClient();
  ig.state.generateDevice(env.IG_USERNAME!);
  await ig.account.login(env.IG_USERNAME!, env.IG_PASSWORD!);
  await ig.publish.photo({
    file: image,
    caption,
  });
}

