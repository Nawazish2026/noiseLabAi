import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { extractTextFromPdf } from '../src/extraction/pdfParser.js';
import { processRawReport } from '../src/extraction/structuredExtractor.js';
import { LabReport } from '../src/db/models/LabReport.js';
import { LabTest } from '../src/db/models/LabTest.js';
import { AuditLog } from '../src/db/models/AuditLog.js';
import { Correction } from '../src/db/models/Correction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, '../samples');

export async function seedDatabase(patientId = 'patient_001') {
  console.log('[Seeder] Connecting to MongoDB...');
  await connectDB();

  console.log(`[Seeder] Clearing existing data for patient: ${patientId}...`);
  await LabReport.deleteMany({ patientId });
  await LabTest.deleteMany({ patientId });
  await AuditLog.deleteMany({ patientId });
  await Correction.deleteMany({ patientId });

  const files = [
    'report_1_2024_01_15.pdf',
    'report_2_2024_06_20.pdf',
    'report_3_2024_11_10.pdf',
    'report_4_adversarial_injection.pdf',
    'report_5_critical_panic_value.pdf'
  ];

  let totalTests = 0;

  for (const filename of files) {
    const filePath = path.join(SAMPLES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[Seeder] File not found: ${filePath}`);
      continue;
    }

    console.log(`[Seeder] Ingesting: ${filename}...`);
    const pdfData = await extractTextFromPdf(filePath);
    const { report, tests } = processRawReport(pdfData.text, filename, 'pdf', patientId);

    await LabReport.create(report);
    if (tests.length > 0) {
      await LabTest.insertMany(tests);
      totalTests += tests.length;
    }
  }

  console.log(`[Seeder] Successfully seeded ${files.length} reports and ${totalTests} structured tests!`);
}

// If executed directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seeder] Error seeding database:', err);
      await disconnectDB();
      process.exit(1);
    });
}
