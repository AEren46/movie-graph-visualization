const express = require('express');
const path = require('path');
const neo4j = require('neo4j-driver');
const app = express();
const port = 3000;

const URI = "neo4j+s://d3cb3690.databases.neo4j.io";
const USER = "neo4j";
const PASSWORD = "X17CC4s_UOdqhSeBLSHCmf2Q8BPWh3HHxiVDiCHL0bE";

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'graph.html'));
});

async function getActorNeighborhood(name, depth) {
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH path = (p:Person {name: $name})-[:ACTED_IN*1..${depth}]-(n) RETURN path`,
            { name, depth }
        );

        let nodes = new Map();
        let edges = new Set();

        result.records.forEach(record => {
            const path = record.get('path');
            path.segments.forEach(segment => {
                const start = segment.start.properties;
                const end = segment.end.properties;
                const relationship = segment.relationship.type;

                if (start.name) {
                    nodes.set(start.name, { data: { id: start.name, label: start.name, type: "Person" } });
                }
                if (end.name) {
                    nodes.set(end.name, { data: { id: end.name, label: end.name, type: "Person" } });
                }
                if (start.title) {
                    nodes.set(start.title, { data: { id: start.title, label: start.title, type: "Movie" } });
                }
                if (end.title) {
                    nodes.set(end.title, { data: { id: end.title, label: end.title, type: "Movie" } });
                }

                edges.add(JSON.stringify({
                    data: {
                        id: `${start.name || start.title}-${end.name || end.title}`,
                        source: start.name || start.title,
                        target: end.name || end.title,
                        label: relationship
                    }
                }));
            });
        });

        return {
            nodes: Array.from(nodes.values()),
            edges: Array.from(edges).map(JSON.parse)
        };
    } catch (error) {
        console.error("Query Error:", error);
        return { nodes: [], edges: [] };
    } finally {
        await session.close();
    }
}

app.get('/api/getActorNeighborhood', async (req, res) => {
    const { name, depth } = req.query;
    const graphData = await getActorNeighborhood(name, depth);
    res.json(graphData);
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

process.on('exit', async () => {
    await driver.close();
});


app.get('/api/getMovieActors', async (req, res) => {
    const { movieId } = req.query;
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (m:Movie)<-[:ACTED_IN]-(a:Person) 
             WHERE m.title = $movieId 
             RETURN m, a`,
            { movieId }
        );

        let nodes = [];
        let edges = [];

        result.records.forEach(record => {
            const movie = record.get('m');
            const actor = record.get('a');

            nodes.push({
                data: {
                    id: movie.properties.title,
                    label: movie.properties.title,
                    type: "Movie"
                }
            });

            nodes.push({
                data: {
                    id: actor.properties.name,
                    label: actor.properties.name,
                    type: "Person"
                }
            });

            edges.push({
                data: {
                    id: `edge-${actor.properties.name}-${movie.properties.title}`,
                    source: actor.properties.name,
                    target: movie.properties.title,
                    label: "ACTED_IN"
                }
            });
        });

        res.json({ nodes, edges });
    } catch (error) {
        console.error("Query error:", error);
        res.status(500).json({ error: "Server error!" });
    } finally {
        await session.close();
    }
});