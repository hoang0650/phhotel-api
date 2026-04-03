const { Message } = require('../models/message');

async function sendMessage (req, res) {
    try {
        const message = new Message(req.body);
        await message.save();
        res.status(201).json(message);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
}

async function getMessages(req, res) {
    try {
        const messages = await Message.find({ receiverId: req.params.userId });
        res.status(200).json(messages);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
}

async function createGroup(req, res) {
    try {
        const group = new Group(req.body);
        await group.save();
        res.status(201).json(group);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
}

async function getGroup(params) {
    try {
        const group = await Group.findById(req.params.groupId).populate('members');
        res.status(200).json(group);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
}


module.exports = {
    getMessages,
    sendMessage,
    getGroup,
    createGroup
}
