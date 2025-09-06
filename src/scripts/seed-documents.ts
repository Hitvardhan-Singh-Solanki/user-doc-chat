import dotenv from "dotenv";
dotenv.config();
import { db } from "../repos/db.repo";
import { v4 as uuidv4 } from "uuid";

interface SeedDocument {
  source_name: string;
  source_url: string;
  law_type?: string;
  jurisdiction?: string;
}

const documents: SeedDocument[] = [
  // Central Government Portals
  {
    source_name: "India Code - Government of India",
    source_url: "https://www.indiacode.nic.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "e-Gazette of India",
    source_url: "https://egazette.nic.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "Department of Legal Affairs",
    source_url: "https://legalaffairs.gov.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "Department of Justice",
    source_url: "https://doj.gov.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "Judgment Search Portal",
    source_url: "https://judgments.ecourts.gov.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "National Portal of India - Law & Justice",
    source_url: "https://www.india.gov.in/topics/law-justice",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "National Portal of India - Documents",
    source_url: "https://www.india.gov.in/my-government/documents",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "Integrated Government Online Directory (iGOD)",
    source_url: "https://igod.gov.in/categories",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "Ministry of Corporate Affairs",
    source_url: "https://www.mca.gov.in/",
    law_type: "Corporate",
    jurisdiction: "India",
  },
  {
    source_name: "Indian Patent Office",
    source_url: "https://ipindia.gov.in/",
    law_type: "Intellectual Property",
    jurisdiction: "India",
  },
  {
    source_name: "Indian Law Institute",
    source_url: "http://ili.ac.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "National Legal Services Authority (NALSA)",
    source_url: "https://nalsa.gov.in/",
    law_type: "All",
    jurisdiction: "India",
  },
  {
    source_name: "Indian Institute of Corporate Affairs",
    source_url: "https://iica.nic.in/",
    law_type: "Corporate",
    jurisdiction: "India",
  },
  {
    source_name: "India.gov.in Portal",
    source_url: "https://www.india.gov.in/",
    law_type: "All",
    jurisdiction: "India",
  },

  // State Government Portals (Example: Maharashtra)
  {
    source_name: "Maharashtra Government - Law & Judiciary",
    source_url: "https://www.mahajudiciary.gov.in/",
    law_type: "All",
    jurisdiction: "Maharashtra",
  },
  {
    source_name: "Maharashtra Government - Gazette",
    source_url: "https://egazette.maharashtra.gov.in/",
    law_type: "All",
    jurisdiction: "Maharashtra",
  },

  // Sector-Specific Portals
  {
    source_name: "Income Tax Department - Acts & Rules",
    source_url: "https://www.incometaxindia.gov.in/pages/acts.aspx",
    law_type: "Tax",
    jurisdiction: "India",
  },
  {
    source_name: "Labour & Employment - Acts",
    source_url: "https://labour.gov.in/acts",
    law_type: "Labour",
    jurisdiction: "India",
  },
  {
    source_name: "Consumer Protection Laws",
    source_url: "https://consumeraffairs.nic.in/acts-rules",
    law_type: "Consumer",
    jurisdiction: "India",
  },
  {
    source_name: "Family Law - Divorce & Marriage Acts",
    source_url: "https://legalaffairs.gov.in/",
    law_type: "Family",
    jurisdiction: "India",
  },
  {
    source_name: "Environmental Laws",
    source_url: "https://moef.gov.in/",
    law_type: "Environmental",
    jurisdiction: "India",
  },
  {
    source_name: "Intellectual Property Laws",
    source_url: "https://ipindia.gov.in/",
    law_type: "Intellectual Property",
    jurisdiction: "India",
  },
];

async function seedLegalDocuments() {
  try {
    const uniqueByUrl = Array.from(
      new Map(documents.map((d) => [d.source_url, d])).values()
    );
    let inserted = 0;
    for (const doc of uniqueByUrl) {
      const res = await db.query(
        `INSERT INTO legal_documents (
          source_name, source_url, law_type, jurisdiction, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (source_url) DO NOTHING`,
        [doc.source_name, doc.source_url, doc.law_type, doc.jurisdiction, "new"]
      );
      inserted += res.rowCount ?? 0;
    }

    console.log(
      `✅ Seeded ${inserted} legal documents (from ${uniqueByUrl.length} unique URLs)`
    );
    await db.end();
    process.exit(0);
  } catch (err) {
    console.error("Error seeding legal documents:", err);
    await db.end();
    process.exit(1);
  }
}

seedLegalDocuments();
