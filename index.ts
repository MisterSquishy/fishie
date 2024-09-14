import axios from 'axios';
import 'dotenv';
import FormData from "form-data";
import { createReadStream, writeFileSync } from 'fs';
import { env } from 'process';

const DEZGO_API_URL = 'https://api.dezgo.com/text-inpainting'

module.exports.handler = async (event) => {
  const formData = new FormData();
  formData.append('mask_prompt', 'bird');
  formData.append('prompt', 'fish');
  formData.append('init_image', createReadStream("bird.jpeg"))

  const result = await axios.postForm(DEZGO_API_URL, formData, {
    headers: {
      "X-Dezgo-Key": env['X-Dezgo-Key'],
    },
    timeout: 60000,
    responseType: 'arraybuffer',
  })
  writeFileSync("fish.png", result.data);
};
