import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export function buildArchiveFilesList(rootDir = projectRoot) {
  const files = [];

  function addFile(relPath) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) return;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(fullPath).sort();
      for (const entry of entries) {
        addFile(path.join(relPath, entry));
      }
    } else if (stat.isFile()) {
      files.push({
        relativePath: relPath.replace(/\\/g, "/"),
        fullPath,
        mode: stat.mode,
        size: stat.size,
      });
    }
  }

  // Add all files that belong to the portable release distribution
  addFile("dist");
  addFile("scripts/installer.mjs");
  addFile("install.ps1");
  addFile("install.sh");
  addFile("package.json");
  addFile("package-lock.json");
  addFile("manifest.json");
  addFile("README.md");
  addFile("LICENSE");

  // Sort files deterministically
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

export function createZipArchive(filesList) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  // Fixed DOS date/time for determinism: 2026-08-27 00:00:00
  // DOS Date: (2026-1980) << 9 | 8 << 5 | 27 = 46 << 9 | 256 | 27 = 23552 + 256 + 27 = 23835 = 0x5D1B
  // DOS Time: 0
  const dosDate = 0x5d1b;
  const dosTime = 0x0000;

  for (const file of filesList) {
    const filenameBuf = Buffer.from(file.relativePath, "utf8");
    const dataBuf = fs.readFileSync(file.fullPath);
    const uncompressedSize = dataBuf.length;
    const crc = zlib.crc32(dataBuf);
    const compressedData = zlib.deflateRawSync(dataBuf, { level: 9 });
    const compressedSize = compressedData.length;

    const isExecutable = file.relativePath.endsWith(".sh") || file.relativePath.endsWith(".ps1");
    const unixAttr = isExecutable ? 0o100755 : 0o100644;

    // Local Header: 30 bytes + name length
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(0, 6); // general purpose flags
    localHeader.writeUInt16LE(8, 8); // compression method (deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    // Central Directory Header: 46 bytes + name length
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(0x0314, 4); // version made by (UNIX 2.0)
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // general purpose flags
    centralHeader.writeUInt16LE(8, 10); // compression method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE((unixAttr << 16) >>> 0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of Central Directory Record: 22 bytes
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(filesList.length, 8);
  eocd.writeUInt16LE(filesList.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

export function createTarGzArchive(filesList) {
  const tarBlocks = [];
  const fixedMtime = 1787788800; // Deterministic timestamp (2026-08-27)

  for (const file of filesList) {
    const data = fs.readFileSync(file.fullPath);
    const header = Buffer.alloc(512);

    const isExecutable = file.relativePath.endsWith(".sh") || file.relativePath.endsWith(".ps1");
    const modeOctal = (isExecutable ? 0o755 : 0o644).toString(8).padStart(7, "0");
    const sizeOctal = data.length.toString(8).padStart(11, "0");
    const mtimeOctal = fixedMtime.toString(8).padStart(11, "0");

    // ustar format
    header.write(file.relativePath, 0, 100, "utf8"); // name
    header.write(modeOctal + " ", 100, 8, "ascii"); // mode
    header.write("0000000 ", 108, 8, "ascii"); // uid
    header.write("0000000 ", 116, 8, "ascii"); // gid
    header.write(sizeOctal + " ", 124, 12, "ascii"); // size
    header.write(mtimeOctal + " ", 136, 12, "ascii"); // mtime
    header.write("        ", 148, 8, "ascii"); // checksum space placeholder
    header.write("0", 156, 1, "ascii"); // typeflag ('0' = regular file)
    header.write("ustar\0", 257, 6, "ascii"); // magic
    header.write("00", 263, 2, "ascii"); // version
    header.write("opencode", 265, 32, "utf8"); // uname
    header.write("opencode", 297, 32, "utf8"); // gname

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i += 1) {
      checksum += header[i];
    }
    const chksumOctal = checksum.toString(8).padStart(6, "0") + "\0 ";
    header.write(chksumOctal, 148, 8, "ascii");

    tarBlocks.push(header);
    tarBlocks.push(data);

    // Padding to 512-byte boundary
    const remainder = data.length % 512;
    if (remainder > 0) {
      tarBlocks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End of tar: two 512-byte zero blocks
  tarBlocks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(tarBlocks);
  return zlib.gzipSync(tarBuffer, { level: 9, mtime: fixedMtime });
}

export function validatePackageHygiene(filesList) {
  const forbiddenPatterns = [
    /C:[/\\]Users/i,
    /C:[/\\]Projects/i,
    /DELL/i,
    /gho_[A-Za-z0-9_]+/i,
    /ghp_[A-Za-z0-9_]+/i,
  ];

  for (const file of filesList) {
    const content = fs.readFileSync(file.fullPath, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        throw new Error(`Hygiene validation failed in ${file.relativePath}: matches forbidden pattern ${pattern}`);
      }
    }
  }

  // Ensure manifest contains only clean built-ins
  const manifestFile = filesList.find((f) => f.relativePath === "manifest.json");
  if (manifestFile) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile.fullPath, "utf8"));
    if (manifest.builtInAgents.includes("agent-github") || manifest.builtInAgents.includes("agent-notebooklm")) {
      throw new Error("Hygiene validation failed: manifest.json contains personal agents");
    }
    if (manifest.builtInAgents.length !== 7) {
      throw new Error(`Expected 7 built-in agents in manifest.json, found ${manifest.builtInAgents.length}`);
    }
  }
}

export function generateReleasePackage(rootDir = projectRoot, outputDir = path.join(projectRoot, "release")) {
  const packageJsonPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = pkg.version;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filesList = buildArchiveFilesList(rootDir);
  validatePackageHygiene(filesList);

  const zipFilename = `suite-de-agentes-v${version}.zip`;
  const tarGzFilename = `suite-de-agentes-v${version}.tar.gz`;
  const sumsFilename = "SHA256SUMS.txt";

  const zipPath = path.join(outputDir, zipFilename);
  const tarGzPath = path.join(outputDir, tarGzFilename);
  const sumsPath = path.join(outputDir, sumsFilename);

  const zipBuffer = createZipArchive(filesList);
  fs.writeFileSync(zipPath, zipBuffer);

  const tarGzBuffer = createTarGzArchive(filesList);
  fs.writeFileSync(tarGzPath, tarGzBuffer);

  const zipHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");
  const tarGzHash = crypto.createHash("sha256").update(tarGzBuffer).digest("hex");

  const checksumsContent = `${zipHash}  ${zipFilename}\n${tarGzHash}  ${tarGzFilename}\n`;
  fs.writeFileSync(sumsPath, checksumsContent, "utf8");

  return {
    version,
    filesCount: filesList.length,
    outputDir,
    zip: { name: zipFilename, path: zipPath, size: zipBuffer.length, sha256: zipHash },
    tarGz: { name: tarGzFilename, path: tarGzPath, size: tarGzBuffer.length, sha256: tarGzHash },
    checksums: { name: sumsFilename, path: sumsPath, content: checksumsContent },
  };
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    console.log("Building dist first...");
    execFileSync("npm", ["run", "build"], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: true,
    });

    console.log("Generating release packages...");
    const result = generateReleasePackage(projectRoot);

    console.log(`\n✓ Generated Release Assets for Suite de Agentes v${result.version}:`);
    console.log(`  - ${result.zip.name} (${result.zip.size} bytes) SHA-256: ${result.zip.sha256}`);
    console.log(`  - ${result.tarGz.name} (${result.tarGz.size} bytes) SHA-256: ${result.tarGz.sha256}`);
    console.log(`  - ${result.checksums.name}`);
    console.log(`\nArchived ${result.filesCount} deterministic files with zero absolute host paths.`);
  } catch (error) {
    console.error(`Packaging failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
