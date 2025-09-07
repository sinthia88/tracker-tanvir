// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-study-tracker';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "AIza...", authDomain: "...", projectId: "..." };
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// setLogLevel('debug');

let userId = null;
let allLogs = [];
let logsUnsubscribe = null; // To detach listener on sign-out

// --- DOM Elements ---
const mainContent = document.querySelector('main');
const loginPrompt = document.getElementById('login-prompt');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userInfo = document.getElementById('user-info');
const userEmailEl = document.getElementById('user-email');
const logSessionForm = document.getElementById('logSessionForm');
const breaksContainer = document.getElementById('breaksContainer');
const addBreakBtn = document.getElementById('addBreakBtn');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const logsContainer = document.getElementById('logsContainer');
const loadingEl = document.getElementById('loading');
const noLogsEl = document.getElementById('noLogs');
const dailyDateEl = document.getElementById('dailyDate');
const downloadDailyBtn = document.getElementById('downloadDailyBtn');
const weeklyDateEl = document.getElementById('weeklyDate');
const downloadWeeklyBtn = document.getElementById('downloadWeeklyBtn');
const monthlyDateEl = document.getElementById('monthlyDate');
const downloadMonthlyBtn = document.getElementById('downloadMonthlyBtn');
const alertModal = document.getElementById('alertModal');
const alertMessage = document.getElementById('alertMessage');
const alertTitle = document.getElementById('alertTitle');
const alertOkBtn = document.getElementById('alertOkBtn');


// --- Utility Functions ---
function formatTime(sec_num) {
    if (isNaN(sec_num) || sec_num < 0) return "00:00:00";
    let sec = parseInt(sec_num, 10);
    let hours   = Math.floor(sec / 3600);
    let minutes = Math.floor((sec % 3600) / 60);
    let seconds = sec % 60;

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    return `${hours}:${minutes}:${seconds}`;
}

function showAlert(message, title = 'Notice') {
    alertTitle.innerText = title;
    alertMessage.innerText = message;
    alertModal.classList.remove('hidden');
}

alertOkBtn.addEventListener('click', () => {
    alertModal.classList.add('hidden');
});

// --- UI Functions ---
function addBreakField() {
    const breakEl = document.createElement('div');
    breakEl.className = 'break-entry border p-4 rounded-lg bg-gray-50 relative';
    breakEl.innerHTML = `
        <button type="button" class="remove-break-btn absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-xl leading-none" title="Remove break">&times;</button>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Break Start Time:</label>
                <input type="datetime-local" name="breakStart" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Break End Time:</label>
                <input type="datetime-local" name="breakEnd" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
            </div>
        </div>
        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-600 mb-1">Reason for Break:</label>
            <input type="text" name="breakReason" class="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Upload Proof (Image):</label>
            <input type="file" name="breakProof" accept="image/*" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" required>
        </div>
    `;
    breaksContainer.appendChild(breakEl);
    breakEl.querySelector('.remove-break-btn').addEventListener('click', () => {
        breakEl.remove();
    });
}

// --- Data Functions ---
async function logSession(sessionData) {
    if (!userId) {
        showAlert("Error: You are not signed in. Cannot save data.", "Authentication Error");
        return;
    }
    try {
        const collectionPath = `artifacts/${appId}/users/${userId}/study_sessions`;
        await addDoc(collection(db, collectionPath), sessionData);
        showAlert('Session logged successfully!', 'Success');
    } catch (error) {
        console.error("Error adding document: ", error);
        showAlert("There was an error saving your session. Please try again.", "Save Error");
    }
}

function renderLogs(logs) {
    loadingEl.style.display = 'none';
    if (logs.length === 0) {
        noLogsEl.classList.remove('hidden');
        logsContainer.innerHTML = '';
        return;
    }
    noLogsEl.classList.add('hidden');
    logsContainer.innerHTML = '';
    logs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    
    logs.forEach(log => {
        const sessionStart = log.sessionStartTime.toDate();
        const sessionEnd = log.sessionEndTime.toDate();
        const logEl = document.createElement('div');
        logEl.className = 'p-4 border rounded-xl bg-gray-50 mb-6 transition-shadow hover:shadow-md';

        const summaryHTML = `
            <div class="border-b pb-3 mb-3">
                <p class="font-bold text-lg text-gray-800">Session on ${sessionStart.toLocaleDateString()}</p>
                <p class="text-sm text-gray-500">
                    <strong>Time:</strong> ${sessionStart.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${sessionEnd.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
                <div class="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-sm">
                    <p><strong>Total Study:</strong> <span class="text-green-600 font-semibold">${formatTime(log.totalStudyDurationSeconds)}</span></p>
                    <p><strong>Total Break:</strong> <span class="text-red-600 font-semibold">${formatTime(log.totalBreakDurationSeconds)}</span></p>
                </div>
            </div>
            <h4 class="font-semibold text-md mb-2">Break Details (${log.breaks.length}):</h4>
        `;
        
        let breaksHTML = '<div class="space-y-4">';
        if (log.breaks && log.breaks.length > 0) {
            log.breaks.forEach(b => {
                const breakStart = b.breakStartTime.toDate();
                const breakEnd = b.breakEndTime.toDate();
                const breakDuration = (breakEnd - breakStart) / 1000;
                breaksHTML += `
                    <div class="flex flex-col sm:flex-row items-start p-3 rounded-lg bg-white border">
                        <div class="flex-grow mb-2 sm:mb-0 sm:mr-4">
                            <p class="font-semibold">${b.reason}</p>
                            <p class="text-xs text-gray-500">${breakStart.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${breakEnd.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (${formatTime(breakDuration)})</p>
                        </div>
                        <div class="flex-shrink-0">
                            <img src="${b.proofImage}" alt="Proof" class="w-full sm:w-24 h-auto rounded-md object-cover cursor-pointer" onclick="window.open('${b.proofImage}', '_blank')">
                        </div>
                    </div>
                `;
            });
        } else {
            breaksHTML += `<p class="text-gray-500 text-sm">No breaks were logged for this session.</p>`;
        }
        breaksHTML += '</div>';
        
        logEl.innerHTML = summaryHTML + breaksHTML;
        logsContainer.appendChild(logEl);
    });
}

function subscribeToLogs() {
     if (!userId) return;
     // Detach any existing listener before creating a new one
     if (logsUnsubscribe) logsUnsubscribe();

     const collectionPath = `artifacts/${appId}/users/${userId}/study_sessions`;
     const q = query(collection(db, collectionPath));
     logsUnsubscribe = onSnapshot(q, (querySnapshot) => {
         const logs = [];
         querySnapshot.forEach((doc) => {
             logs.push({ id: doc.id, ...doc.data() });
         });
         allLogs = logs;
         renderLogs(logs);
     }, (error) => {
        console.error("Error getting logs: ", error);
        loadingEl.innerText = "Error loading logs.";
     });
}

function clearLogs() {
    if (logsUnsubscribe) {
        logsUnsubscribe();
        logsUnsubscribe = null;
    }
    allLogs = [];
    logsContainer.innerHTML = '';
    noLogsEl.classList.remove('hidden');
    loadingEl.style.display = 'none';
}

// --- Report Generation and Download ---
function getWeekRange(weekString) {
    const [year, week] = weekString.split('-W').map(Number);
    const d = new Date(year, 0, 1 + (week - 1) * 7);
    if (d.getDay() !== 1) d.setDate(d.getDate() - (d.getDay() - 1 + 7) % 7);
    const start = new Date(d);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    return { start, end };
}

function getMonthRange(monthString) {
    const [year, month] = monthString.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function generatePDF(logs, period, filename) {
    if (logs.length === 0) {
        showAlert(`No data available for ${period}.`);
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const totalStudySeconds = logs.reduce((acc, log) => acc + log.totalStudyDurationSeconds, 0);
    const totalBreakSeconds = logs.reduce((acc, log) => acc + log.totalBreakDurationSeconds, 0);
    const sortedLogs = [...logs].sort((a, b) => a.sessionStartTime.toMillis() - b.sessionStartTime.toMillis());

    // --- PDF Header ---
    doc.setFontSize(20);
    doc.text("Study Session Report", 105, 20, null, null, "center");
    doc.setFontSize(12);
    doc.text(`Period: ${period}`, 105, 28, null, null, "center");

    // --- Summary ---
    doc.setFontSize(14);
    doc.text("Summary", 14, 45);
    doc.setFontSize(10);
    doc.text(`Total Study Time: ${formatTime(totalStudySeconds)}`, 14, 52);
    doc.text(`Total Break Time: ${formatTime(totalBreakSeconds)}`, 14, 58);

    // --- Session Details Table ---
    const sessionHead = [['Session Start', 'Session End', 'Study Time', 'Break Time', '# Breaks']];
    const sessionBody = sortedLogs.map(log => [
        log.sessionStartTime.toDate().toLocaleString(),
        log.sessionEndTime.toDate().toLocaleString(),
        formatTime(log.totalStudyDurationSeconds),
        formatTime(log.totalBreakDurationSeconds),
        log.breaks.length
    ]);

    doc.autoTable({
        head: sessionHead,
        body: sessionBody,
        startY: 65,
        headStyles: { fillColor: [74, 85, 104] }, // slate-700
        didDrawPage: function(data) {
            doc.setFontSize(16);
            doc.text("Session Details", 14, data.cursor.y - 10);
        }
    });

    // --- Break Details Table ---
    const breakHead = [['Session Start', 'Break Start', 'Break End', 'Duration', 'Reason']];
    const breakBody = [];
    sortedLogs.forEach(log => {
        if (log.breaks && log.breaks.length > 0) {
            log.breaks.forEach(b => {
                breakBody.push([
                    log.sessionStartTime.toDate().toLocaleDateString(),
                    b.breakStartTime.toDate().toLocaleString(),
                    b.breakEndTime.toDate().toLocaleString(),
                    formatTime((b.breakEndTime.toDate() - b.breakStartTime.toDate()) / 1000),
                    b.reason
                ]);
            });
        }
    });

    if (breakBody.length > 0) {
        doc.autoTable({
            head: breakHead,
            body: breakBody,
            startY: doc.lastAutoTable.finalY + 15,
            headStyles: { fillColor: [74, 85, 104] },
             didDrawPage: function(data) {
                doc.setFontSize(16);
                doc.text("Break Details", 14, data.cursor.y - 10);
            }
        });
    }

    doc.save(filename);
}

// --- Authentication ---
const provider = new GoogleAuthProvider();

async function signInWithGoogle() {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google Sign-In failed:", error);
        showAlert("Could not sign in with Google. Please try again.", "Sign-In Error");
    }
}

async function signOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign-out failed:", error);
        showAlert("An error occurred while signing out.", "Sign-Out Error");
    }
}


// --- Event Listeners ---
addBreakBtn.addEventListener('click', addBreakField);

logSessionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSessionBtn.disabled = true;
    saveSessionBtn.textContent = 'Saving...';
    
    const sessionStart = new Date(e.target.sessionStart.value);
    const sessionEnd = new Date(e.target.sessionEnd.value);
    
    if (isNaN(sessionStart.getTime()) || isNaN(sessionEnd.getTime()) || sessionEnd <= sessionStart) {
        showAlert('Please enter a valid start and end time for the session, where the end time is after the start time.');
        saveSessionBtn.disabled = false;
        saveSessionBtn.textContent = 'Save Session';
        return;
    }

    const breakEntries = breaksContainer.querySelectorAll('.break-entry');
    const breaksData = [];
    const imagePromises = [];

    const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    for (const entry of breakEntries) {
        const breakStart = new Date(entry.querySelector('[name="breakStart"]').value);
        const breakEnd = new Date(entry.querySelector('[name="breakEnd"]').value);
        const reason = entry.querySelector('[name="breakReason"]').value;
        const proofFile = entry.querySelector('[name="breakProof"]').files[0];

        if (isNaN(breakStart.getTime()) || isNaN(breakEnd.getTime()) || breakEnd <= breakStart) {
            showAlert('One of the breaks has an invalid start or end time. Ensure end time is after start time.');
            saveSessionBtn.disabled = false;
            saveSessionBtn.textContent = 'Save Session';
            return;
        }
        if (breakStart < sessionStart || breakEnd > sessionEnd) {
            showAlert('Break times must be within the overall session start and end times.');
            saveSessionBtn.disabled = false;
            saveSessionBtn.textContent = 'Save Session';
            return;
        }
        if (!proofFile) {
            showAlert('Please provide an image proof for every break.');
            saveSessionBtn.disabled = false;
            saveSessionBtn.textContent = 'Save Session';
            return;
        }

        imagePromises.push(readFileAsBase64(proofFile));
        breaksData.push({ breakStart, breakEnd, reason });
    }

    try {
        const imageBase64s = await Promise.all(imagePromises);
        breaksData.forEach((breakItem, index) => {
            breakItem.proofImage = imageBase64s[index];
        });

        const totalSessionDuration = (sessionEnd - sessionStart) / 1000;
        const totalBreakDuration = breaksData.reduce((acc, b) => acc + (b.breakEnd - b.breakStart) / 1000, 0);
        const totalStudyDuration = totalSessionDuration - totalBreakDuration;

        if (totalStudyDuration < 0) {
            showAlert('Total break time cannot be longer than the total session time.');
            saveSessionBtn.disabled = false;
            saveSessionBtn.textContent = 'Save Session';
            return;
        }

        const sessionDoc = {
            sessionStartTime: sessionStart,
            sessionEndTime: sessionEnd,
            totalStudyDurationSeconds: totalStudyDuration,
            totalBreakDurationSeconds: totalBreakDuration,
            breaks: breaksData.map(b => ({
                breakStartTime: b.breakStart,
                breakEndTime: b.breakEnd,
                reason: b.reason,
                proofImage: b.proofImage
            })),
            createdAt: new Date()
        };

        await logSession(sessionDoc);
        logSessionForm.reset();
        breaksContainer.innerHTML = '';

    } catch (error) {
        console.error("Error processing session:", error);
        showAlert('An error occurred while saving the session. Please check your inputs and try again.');
    } finally {
        saveSessionBtn.disabled = false;
        saveSessionBtn.textContent = 'Save Session';
    }
});

downloadDailyBtn.addEventListener('click', () => {
    const date = dailyDateEl.value;
    if (!date) {
        showAlert("Please select a date first.");
        return;
    }
    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59');

    const filteredLogs = allLogs.filter(log => {
        const logDate = log.sessionStartTime.toDate();
        return logDate >= start && logDate <= end;
    });
    
    generatePDF(filteredLogs, `the date ${date}`, `study_report_daily_${date}.pdf`);
});

downloadWeeklyBtn.addEventListener('click', () => {
    const week = weeklyDateEl.value;
    if (!week) {
        showAlert("Please select a week first.");
        return;
    }
    const { start, end } = getWeekRange(week);
    const filteredLogs = allLogs.filter(log => {
        const logDate = log.sessionStartTime.toDate();
        return logDate >= start && logDate <= end;
    });
    generatePDF(filteredLogs, `the week starting ${start.toLocaleDateString()}`, `study_report_weekly_${week}.pdf`);
});

downloadMonthlyBtn.addEventListener('click', () => {
    const month = monthlyDateEl.value;
    if (!month) {
        showAlert("Please select a month first.");
        return;
    }
    const { start, end } = getMonthRange(month);
    const filteredLogs = allLogs.filter(log => {
        const logDate = log.sessionStartTime.toDate();
        return logDate >= start && logDate <= end;
    });
    generatePDF(filteredLogs, `the month of ${start.toLocaleString('default', { month: 'long', year: 'numeric' })}`, `study_report_monthly_${month}.pdf`);
});

// --- App Initialization ---
function handleAuthState(user) {
    if (user) {
        // User is signed in
        userId = user.uid;
        mainContent.classList.remove('hidden');
        loginPrompt.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userEmailEl.textContent = user.email;

        // Ensure sign-in button listener is removed and sign-out is added
        signInBtn.removeEventListener('click', signInWithGoogle);
        signOutBtn.addEventListener('click', signOutUser);
        
        subscribeToLogs();

    } else {
        // User is signed out
        userId = null;
        mainContent.classList.add('hidden');
        loginPrompt.classList.remove('hidden');
        userInfo.classList.add('hidden');
        userEmailEl.textContent = '';
        
        // Ensure sign-out button listener is removed and sign-in is added
        signOutBtn.removeEventListener('click', signOutUser);
        signInBtn.addEventListener('click', signInWithGoogle);
        
        clearLogs();
    }
}

function main() {
    onAuthStateChanged(auth, handleAuthState);
}

main();

