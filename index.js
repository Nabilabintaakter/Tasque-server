require("dotenv").config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Verify Token Middleware
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
    });
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5f9uk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const db = client.db('TasqueDB');
        const usersCollection = db.collection('users');
        const tasksCollection = db.collection('tasks');

        // JWT Related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // Users Related API
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists!', insertedId: null });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Tasks Related API
        app.post('/tasks', verifyToken, async (req, res) => {
            const newTask = req.body;
            const result = await tasksCollection.insertOne(newTask);
            res.send(result);
        });

        app.get('/tasks/:email', verifyToken, async (req, res) => {
            const { email } = req.params;
            const query = { email };
            const result = await tasksCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/my-task/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await tasksCollection.deleteOne(query);
            res.send(result);
        });

        app.patch('/my-task/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const { title, description, category, order } = req.body;
        
            const filter = { _id: new ObjectId(id) };
            const updatedTask = {
                $set: {
                    title,
                    description,
                    category,
                    order,  // Set the order field as well
                },
            };
        
            try {
                const result = await tasksCollection.updateOne(filter, updatedTask);
                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "task not found" });
                }
                res.send(result);
            } catch (error) {
                console.error("Error updating task:", error);
                res.status(500).send({ error: "Failed to update task" });
            }
        });
        app.patch('/reorder-tasks', verifyToken, async (req, res) => {
            const { category, orderedTaskIds } = req.body; // orderedTaskIds should be an array of task IDs in the new order
        
            if (!category || !orderedTaskIds || !Array.isArray(orderedTaskIds)) {
                return res.status(400).send({ error: "category and orderedTaskIds are required" });
            }
        
            // Reorder the tasks in the database
            try {
                const bulkOps = orderedTaskIds.map((taskId, index) => ({
                    updateOne: {
                        filter: { _id: new ObjectId(taskId) },
                        update: { $set: { order: index } }, // Set the new order
                    },
                }));
        
                const result = await tasksCollection.bulkWrite(bulkOps);
                res.send({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
            } catch (error) {
                console.error("Error reordering tasks:", error);
                res.status(500).send({ error: "Failed to reorder tasks" });
            }
        });
        
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // No need to close the client here; it's handled by the Node.js process
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Tasque is here for you! Are you ready?');
});

app.listen(port, () => {
    console.log(`Tasque server is running on port: ${port}`);
});