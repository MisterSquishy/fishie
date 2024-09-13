import 'dotenv';
import fs from "fs";
import OpenAI from "openai";

module.exports.handler = async (event) => {
  const openai = new OpenAI();

  async function main() {
    const image = await openai.images.edit({
      image: fs.createReadStream("bird.png"),
      prompt: "Replace the bird in this image with a fish",
    });

    console.log(image.data);
  }
  main();
};
