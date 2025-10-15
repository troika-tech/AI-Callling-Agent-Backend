const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');

const currentUser = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

const overview = asyncHandler(async (req, res, next) => {
  try {
    const info = await millis.getUserInfo();
    const billing = info && typeof info === 'object' ? {
      credit: info.credit ?? null,
      used_credit: info.used_credit ?? null,
      auto_refill: info.auto_refill ?? null
    } : null;

    res.json({
      user: req.user,
      billing
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  currentUser,
  overview
};