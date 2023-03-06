const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const Product = require('./models/Product');
require('dotenv').config();

// Set up AWS credentials and S3 instance
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Set up Multer for handling file uploads
const storage = multer.memoryStorage({
  destination: function (req, file, callback) {
    callback(null, '');
  },
});

const upload = multer({ storage }).array('images', 6);

// Set up Express server
const app = express();
const port = process.env.PORT || 5000;

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected...'))
  .catch((err) => console.log(err));

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  app.use(express.static('client/build'));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

// API routes
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/products', (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: 'Server error' });
    }

    const { name, description, price, currency } = req.body;

    // Upload images to S3 and get URLs
    const urls = [];
    const keys = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const key = uuidv4();
      keys.push(key);

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ACL: 'public-read',
      };

      try {
        const response = await s3.upload(params).promise();
        urls.push(response.Location);
      } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
      }
    }

    // Save product to database
    const product = new Product({
      name,
      description,
      price,
      currency,
      images: keys.map((key, index) => ({
        key,
        url: urls[index],
      })),
    });

    try {
      const newProduct = await product.save();
      res.json(newProduct);
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
