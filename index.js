//dalle bot
require('dotenv').config();

//discord
const { Client, Events, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

//openai
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_APIKEY });

//axios
const axios = require('axios');

//functions
async function handleError(event, error) {
  let errorMessage = `${error || 'Unknown error'}.`;
  console.error(errorMessage);
  await prepMessage(event, errorMessage);
}

async function updateBotStatus(statusType, activityType, statusName) {
  if (client.user.presence.status !== statusType) { client.user.setStatus(statusType); }  // rate limited, unknown duration // online, idle, dnd, invisible
  if (client.user.presence.type !== statusName) { client.user.setActivity(statusName, {type: activityType}); } // playing = 0, listening (to) = 2, watching = 3
}

async function analyzeImage(message, imageUrls) {
  try {
    const content = [{ type: "text", text: message }];

    imageUrls.forEach(url => {
      content.push({
        type: "image_url",
        image_url: {
          url: url,
          detail: "high"
        }
      });
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: content }]
    });

    return response.choices[0].message.content;
  }
  catch (error) { await handleError(event, error); return null; }
}

async function generateImage(event, prompt) {
  try {
    const image = await openai.images.generate({ prompt: prompt, model: "dall-e-3", quality: `hd`, size: `1792x1024` });
    return image.data[0];
  }
  catch (error) { await handleError(event, error); return null; }
}

async function downloadImage(event, url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }
  catch (error) { await handleError(event, error); return null; }
}

async function sendMessage(event, content) {
  try { const message = await event.reply(content); }
  catch (error) { await handleError(event, error); }
}

async function sendImage(event, content, imageBuffer, fileName) {
  try {
    const payload = { content, files: [{ attachment: imageBuffer, name: fileName }] };
    await event.reply(payload);
  }
  catch (error) { await handleError(event, error); }
}

function sendTyping(channel) {
  if (!keepTyping) { return; }
  channel.sendTyping().then(() => { setTimeout(() => sendTyping(channel), 10000); });
}

let keepTyping = true;

//main logic
client.on('messageCreate', async event => {
  if (event.author.bot || event.content.includes("@here") || event.content.includes("@everyone") || event.content.includes("@skynet") || !event.mentions.has(client.user.id)) { return; }
  let channel = event.channel.id;
  let authorID = event.author.id;
  let authorTag = `<@${authorID}>`;
  let content = event.content;
  let message = content.replace(/<@\d+>/,'').trim();
  let attachment = event.attachments;
  
  if (attachment.size > 0) { //vision
    try {
      keepTyping = true;
      sendTyping(event.channel);
      const urls = attachment.map(a => a.url);
      const analysis = await analyzeImage(message, urls);
      await sendMessage(event, analysis);
    }
    catch (error) { await handleError(event, error); }
    finally { keepTyping = false; }
  }

  else { //generate
    try {
      const startTime = Date.now();
      keepTyping = true;
      sendTyping(event.channel);
      let image = await generateImage(event, message);
      let imageBuffer = await downloadImage(event, image.url);
      const duration = (Date.now() - startTime) / 1000;
      await sendImage(event, `Generated Image (${duration} seconds):`, imageBuffer, 'image.png');
      await sendMessage(event, `Optimized prompt: ${image.revised_prompt}`);
      await updateBotStatus(`online`, 2, `you for input`);
    }
    catch (error) { await handleError(event, error); }
    finally { keepTyping = false; }
  }

});

//startup
client.once(Events.ClientReady, botUser => {
  updateBotStatus(`online`, 2, `you for input`);
  console.log(`Bot is online.`);
});

//login
client.login(process.env.DISCORD_TOKEN);