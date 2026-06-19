const fs = require('fs');
const path = require('path');

const { promises: fsp } = fs;
const originalRename = fsp.rename.bind(fsp);
const originalRenameCb = fs.rename.bind(fs);

const copyThenUnlink = async (src, dest) => {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  await fsp.unlink(src);
};

fsp.rename = async (src, dest) => {
  try {
    return await originalRename(src, dest);
  } catch (error) {
    if (error && error.code === 'EXDEV') {
      await copyThenUnlink(src, dest);
      return;
    }
    throw error;
  }
};

fs.rename = (src, dest, cb) => {
  originalRenameCb(src, dest, async (error) => {
    if (error && error.code === 'EXDEV') {
      try {
        await copyThenUnlink(src, dest);
        cb(null);
      } catch (copyError) {
        cb(copyError);
      }
      return;
    }
    cb(error);
  });
};
