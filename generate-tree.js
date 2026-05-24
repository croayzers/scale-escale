const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();

function buildTree(dir, prefix = "") {
  const items = fs.readdirSync(dir).filter(i =>
    i !== "node_modules" &&
    i !== ".git" &&
    i !== "project-tree.txt"
  );

  let tree = "";

  items.forEach((item, index) => {
    const fullPath = path.join(dir, item);
    const isLast = index === items.length - 1;
    const connector = isLast ? "└── " : "├── ";

    if (fs.statSync(fullPath).isDirectory()) {
      tree += `${prefix}${connector}${item}/\n`;
      tree += buildTree(fullPath, prefix + (isLast ? "    " : "│   "));
    } else {
      tree += `${prefix}${connector}${item}\n`;
    }
  });

  return tree;
}

const tree = `PROJECT STRUCTURE\n\n${buildTree(ROOT_DIR)}`;

fs.writeFileSync("project-tree.txt", tree);

console.log("✔ Project tree updated");