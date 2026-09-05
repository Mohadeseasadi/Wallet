import express from "express";
import sequelize from "./config/database";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


sequelize.authenticate()
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((error : any) => {
    console.error("Database connection failed:", error);
  });

app.get("/", (req, res) => {
  res.json({
    message: "API is running 🚀",
  });
});

export default app;