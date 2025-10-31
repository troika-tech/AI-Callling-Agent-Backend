const csv = require('csv-parser');
const fs = require('fs');
const { parsePhoneNumber } = require('libphonenumber-js');

/**
 * Parse CSV file containing target phone numbers
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Array>} Array of parsed phone numbers with validation
 */
async function parseTargetNumbers(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];
    let rowCount = 0;
    const maxRows = 10000; // Limit to prevent memory issues

    const stream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        
        if (rowCount > maxRows) {
          errors.push(`Maximum ${maxRows} rows allowed per campaign`);
          stream.destroy();
          return;
        }

        // Validate required phone column
        if (!row.phone && !row.Phone && !row.PHONE) {
          errors.push(`Row ${rowCount}: Missing required 'phone' column`);
          return;
        }

        const phoneValue = row.phone || row.Phone || row.PHONE;
        const nameValue = row.name || row.Name || row.NAME || '';
        
        // Clean phone number
        const cleanedPhone = phoneValue.replace(/[^\d+]/g, '');
        
        // Validate phone number
        let isValid = false;
        let formattedPhone = cleanedPhone;
        
        try {
          if (cleanedPhone.startsWith('+')) {
            // International format
            const phoneNumber = parsePhoneNumber(cleanedPhone);
            isValid = phoneNumber.isValid();
            formattedPhone = phoneNumber.format('E.164');
          } else if (cleanedPhone.length >= 10) {
            // Assume US format if no country code
            const phoneNumber = parsePhoneNumber(cleanedPhone, 'US');
            isValid = phoneNumber.isValid();
            formattedPhone = phoneNumber.format('E.164');
          }
        } catch (error) {
          // Invalid phone number format
          isValid = false;
        }

        results.push({
          phone: formattedPhone,
          name: nameValue.trim(),
          metadata: {
            original_phone: phoneValue,
            row_number: rowCount,
            ...Object.fromEntries(
              Object.entries(row).filter(([key]) => 
                !['phone', 'Phone', 'PHONE', 'name', 'Name', 'NAME'].includes(key)
              )
            )
          },
          isValid
        });
      })
      .on('end', () => {
        if (errors.length > 0) {
          reject(new Error(`CSV parsing errors: ${errors.join(', ')}`));
        } else {
          resolve(results);
        }
      })
      .on('error', (error) => {
        reject(new Error(`Failed to parse CSV file: ${error.message}`));
      });
  });
}

/**
 * Validate CSV file structure before parsing
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Object>} Validation result
 */
async function validateCsvStructure(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Check if required columns exist
        const hasPhoneColumn = !!(row.phone || row.Phone || row.PHONE);
        
        if (!hasPhoneColumn) {
          stream.destroy();
          reject(new Error('CSV file must contain a "phone" column'));
          return;
        }

        // Get column names
        const columns = Object.keys(row);
        
        stream.destroy();
        resolve({
          isValid: true,
          columns,
          hasPhoneColumn: true,
          hasNameColumn: !!(row.name || row.Name || row.NAME)
        });
      })
      .on('error', (error) => {
        reject(new Error(`Failed to validate CSV file: ${error.message}`));
      });
  });
}

/**
 * Generate sample CSV template
 * @returns {string} CSV content
 */
function generateCsvTemplate() {
  return `phone,name,company,notes
+1234567890,John Doe,Acme Corp,Sales lead
+1987654321,Jane Smith,Tech Inc,Marketing inquiry
+1555123456,Bob Johnson,Startup LLC,Product demo request`;
}

module.exports = {
  parseTargetNumbers,
  validateCsvStructure,
  generateCsvTemplate
};
