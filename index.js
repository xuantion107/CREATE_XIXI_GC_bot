```javascript
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

// Initialize bot with token from environment variables
const bot = new Telegraf(process.env.BOT_TOKEN);

// Product Data
const products = [
  {
    "id": "1",
    "name": "Nitro Boost Monthly",
    "price": 9.99,
    "description": "Elevate your discord experience with high-quality audio and more perks.",
    "category": "Digital",
    "image": "https://picsum.photos/seed/nitro/200/200"
  },
  {
    "id": "2",
    "name": "Bot Source Code",
    "price": 49,
    "description": "Complete source code for this shop bot built with Node.js.",
    "category": "Service",
    "image": "https://picsum.photos/seed/code/200/200"
  }
];

// Start Command
bot.start((ctx) => {
  ctx.reply(
    "Welcome to the future of digital shopping! How can I help you today?",
    Markup.inlineKeyboard([
      [Markup.button.callback('Catalog', 'btn_catalog')],
      [Markup.button.callback('Support', 'btn_support'), Markup.button.callback('My Orders', 'btn_orders')]
    ])
  );
});

// Catalog Handler
bot.action('btn_catalog', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    if (products.length === 0) {
      return ctx.reply("The catalog is currently empty.");
    }

    // Loop through products and send each as a separate message
    for (const product of products) {
      const caption = `<b>${product.name}</b>\n` +
                      `Category: <i>${product.category}</i>\n` +
                      `${product.description}\n\n` +
                      `<b>Price: $${product.price}</b>`;

      await ctx.replyWithPhoto(product.image, {
        caption: caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.callback('Buy Now', `buy_${product.id}`)
        ])
      });
    }
  } catch (error) {
    console.error('Error showing catalog:', error);
    ctx.reply("An error occurred while loading the catalog.");
  }
});

// Support Handler
bot.action('btn_support', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    ctx.reply("Support functionality is under construction. Please contact an admin directly.");
  } catch (error) {
    console.error(error);
  }
});

// My Orders Handler
bot.action('btn_orders', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    ctx.reply("You have no active orders at the moment.");
  } catch (error) {
    console.error(error);
  }
});

// Buy Now Button Handler
bot.action(/buy_(.+)/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const product = products.find(p => p.id === productId);

    await ctx.answerCbQuery();

    if (product) {
      ctx.reply(`You have initiated checkout for: <b>${product.name}</b> ($${product.price}).`, { parse_mode: 'HTML' });
    } else {
      ctx.reply("Sorry, this product is no longer available.");
    }
  } catch (error) {
    console.error('Error in purchase flow:', error);
    ctx.reply("An error occurred processing your request.");
  }
});

// Global Error Handling
bot.catch((err, ctx) => {
  console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// Launch the bot
bot.launch().then(() => {
  console.log('AutoShop Prime is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```
