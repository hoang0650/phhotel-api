const {Chatbox} = require('../models/chatbox');
// const User = require('../models/userModel');

// Create a new message
// exports.createMessage = async (req, res) => {
//   try {
//     const { sender, receiver, message } = req.body;
//     const newMessage = await Message.create({ sender, receiver, message });
//     res.status(201).json(newMessage);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// Create a new message
async function createMessage (req, res) {
    try {
      const { message, isBotMessage } = req.body;
      const newMessage = await Chatbox.create({ message, isBotMessage });
      res.status(201).json(newMessage);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

// Get messages between two users
async function getMessages (req, res) {
  try {
    const messages = await Chatbox.find()
    res.status(200).json(messages);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {createMessage,getMessages}
