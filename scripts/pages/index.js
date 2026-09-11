/**
 * ทะเบียนหน้าทั้งหมด — เพิ่มหน้าใหม่คือเพิ่มสองบรรทัดในไฟล์นี้
 * ไฟล์อื่นไม่ต้องแก้เลย
 */
import * as home      from './home.page.js';
import * as policies  from './policies.page.js';
import * as forms     from './forms.page.js';
import * as requests  from './requests.page.js';
import * as projects  from './projects.page.js';
import * as rooms     from './rooms.page.js';
import * as documents from './documents.page.js';
import * as reports   from './reports.page.js';
import * as directory from './directory.page.js';
import * as contact   from './contact.page.js';
import * as admin     from './admin.page.js';

export const pages = [home, policies, forms, requests, projects, rooms, documents, reports, directory, contact, admin];

export const pageByRoute = (route) => pages.find((p) => p.meta.route === route);
