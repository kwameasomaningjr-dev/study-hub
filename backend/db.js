const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

// Initialize empty DB if not exists
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({
    users: [],
    courses: [],
    notes: [],
    uploads: []
  }, null, 2));
}

function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { users: [], courses: [], notes: [], uploads: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Helper to wrap item with helper methods (e.g. .save(), .destroy())
function wrapItem(table, item, data) {
  if (!item) return null;
  return {
    ...item,
    save: async function() {
      const db = readDB();
      const index = db[table].findIndex(x => x.id === this.id);
      if (index !== -1) {
        // Exclude methods from saved object
        const savedData = { ...this };
        delete savedData.save;
        delete savedData.destroy;
        delete savedData.toJSON;
        db[table][index] = savedData;
        writeDB(db);
      }
      return this;
    },
    destroy: async function() {
      const db = readDB();
      db[table] = db[table].filter(x => x.id !== this.id);
      writeDB(db);
    },
    toJSON: function() {
      const copy = { ...this };
      delete copy.save;
      delete copy.destroy;
      delete copy.toJSON;
      return copy;
    }
  };
}

const User = {
  async findOne({ where }) {
    const db = readDB();
    const user = db.users.find(u => {
      return Object.entries(where).every(([key, value]) => u[key] === value);
    });
    return wrapItem('users', user);
  },
  async findByPk(id) {
    const db = readDB();
    const user = db.users.find(u => u.id === Number(id));
    return wrapItem('users', user);
  },
  async create(userData) {
    const db = readDB();
    const newId = db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1;
    const user = {
      id: newId,
      ...userData,
      bio: userData.bio || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.users.push(user);
    writeDB(db);
    return wrapItem('users', user);
  }
};

const Course = {
  async count() {
    const db = readDB();
    return db.courses.length;
  },
  async findAll() {
    const db = readDB();
    return db.courses;
  },
  async create(courseData) {
    const db = readDB();
    const newId = db.courses.length > 0 ? Math.max(...db.courses.map(c => c.id)) + 1 : 1;
    const course = {
      id: newId,
      ...courseData,
      createdAt: new Date().toISOString()
    };
    db.courses.push(course);
    writeDB(db);
    return course;
  },
  async bulkCreate(coursesList) {
    const db = readDB();
    let currentId = db.courses.length > 0 ? Math.max(...db.courses.map(c => c.id)) + 1 : 1;
    const added = coursesList.map(c => ({
      id: currentId++,
      ...c,
      createdAt: new Date().toISOString()
    }));
    db.courses.push(...added);
    writeDB(db);
    return added;
  }
};

const Note = {
  async count({ where } = {}) {
    const db = readDB();
    if (where && where.userId) {
      return db.notes.filter(n => n.userId === Number(where.userId)).length;
    }
    return db.notes.length;
  },
  async findAll({ where, order } = {}) {
    const db = readDB();
    let results = db.notes;
    
    if (where) {
      results = results.filter(n => {
        return Object.entries(where).every(([key, value]) => n[key] === Number(value) || n[key] === value);
      });
    }

    // Populate Course association
    results = results.map(n => {
      const course = db.courses.find(c => c.id === Number(n.courseId));
      return {
        ...n,
        Course: course ? { name: course.name } : null
      };
    });

    if (order) {
      const [[col, dir]] = order;
      if (col === 'createdAt') {
        results.sort((a, b) => {
          return dir.toLowerCase() === 'desc' 
            ? new Date(b.createdAt) - new Date(a.createdAt)
            : new Date(a.createdAt) - new Date(b.createdAt);
        });
      }
    }

    return results;
  },
  async findOne({ where }) {
    const db = readDB();
    const note = db.notes.find(n => {
      return Object.entries(where).every(([key, value]) => n[key] === Number(value) || n[key] === value);
    });
    return wrapItem('notes', note);
  },
  async create(noteData) {
    const db = readDB();
    const newId = db.notes.length > 0 ? Math.max(...db.notes.map(n => n.id)) + 1 : 1;
    const note = {
      id: newId,
      ...noteData,
      courseId: noteData.courseId ? Number(noteData.courseId) : null,
      userId: Number(noteData.userId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.notes.push(note);
    writeDB(db);
    return wrapItem('notes', note);
  }
};

const Upload = {
  async count({ where } = {}) {
    const db = readDB();
    if (where && where.userId) {
      return db.uploads.filter(u => u.userId === Number(where.userId)).length;
    }
    return db.uploads.length;
  },
  async findAll({ where, order } = {}) {
    const db = readDB();
    let results = db.uploads;

    if (where) {
      results = results.filter(u => {
        return Object.entries(where).every(([key, value]) => u[key] === Number(value) || u[key] === value);
      });
    }

    if (order) {
      const [[col, dir]] = order;
      if (col === 'createdAt') {
        results.sort((a, b) => {
          return dir.toLowerCase() === 'desc' 
            ? new Date(b.createdAt) - new Date(a.createdAt)
            : new Date(a.createdAt) - new Date(b.createdAt);
        });
      }
    }

    return results;
  },
  async create(uploadData) {
    const db = readDB();
    const newId = db.uploads.length > 0 ? Math.max(...db.uploads.map(u => u.id)) + 1 : 1;
    const uploadItem = {
      id: newId,
      ...uploadData,
      userId: Number(uploadData.userId),
      createdAt: new Date().toISOString()
    };
    db.uploads.push(uploadItem);
    writeDB(db);
    return wrapItem('uploads', uploadItem);
  }
};

// Dummy Sequelize instance
const sequelize = {
  async authenticate() {
    return true;
  },
  async sync() {
    return true;
  },
  async close() {
    return true;
  }
};

module.exports = {
  sequelize,
  User,
  Course,
  Note,
  Upload
};
