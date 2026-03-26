document.addEventListener('DOMContentLoaded', async function() {
    const user = userManager.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    let sessionId = params.get('session');

    const userInfo = document.getElementById('userInfo');
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    const chatMessages = document.getElementById('chatMessages');
    const profileForm = document.getElementById('profileForm');
    const sessionSummary = document.getElementById('sessionSummary');
    const sessionTitle = document.getElementById('sessionTitle');
    const sessionStatus = document.getElementById('sessionStatus');
    const progressText = document.getElementById('progressText');
    const answerPanel = document.getElementById('answerPanel');
    const answerLabel = document.getElementById('answerLabel');
    const questionModeBadge = document.getElementById('questionModeBadge');
    const answerInput = document.getElementById('answerInput');
    const answerTip = document.getElementById('answerTip');
    const answerSuggestions = document.getElementById('answerSuggestions');
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    const skipAnswerBtn = document.getElementById('skipAnswerBtn');
    const nextStepBtn = document.getElementById('nextStepBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const confirmProfileBtn = document.getElementById('confirmProfileBtn');
    const confirmHint = document.getElementById('confirmHint');
    const jobTitleInput = document.getElementById('jobTitleInput');
    const jobDescriptionInput = document.getElementById('jobDescriptionInput');
    const analyzeJobMatchBtn = document.getElementById('analyzeJobMatchBtn');
    const jobMatchResult = document.getElementById('jobMatchResult');
    const jobMatchList = document.getElementById('jobMatchList');
    const logoutBtn = document.getElementById('logoutBtn');

    let currentSession = null;
    let nextQuestion = null;
    let profileFields = [];
    let jobMatches = [];

    if (userInfo) {
        userInfo.textContent = user.username;
    }

    async function ensureSession() {
        if (sessionId) {
            return;
        }
        const response = await api.createInterviewSession(user.id);
        sessionId = response.session.id;
        history.replaceState(null, '', '/interview.html?session=' + sessionId);
    }

    async function loadSession() {
        try {
            clearMessages();
            const response = await api.getInterviewSession(sessionId);
            hydrateSessionState(response);
            renderSession();
        } catch (error) {
            showError(error.message);
        }
    }

    function hydrateSessionState(response) {
        currentSession = response.session;
        nextQuestion = response.next_question;
        profileFields = response.profile_fields || [];
        jobMatches = response.job_matches || [];
    }

    function renderSession() {
        sessionTitle.textContent = currentSession.title || '问诊式求职分析';
        sessionStatus.textContent = translateStatus(currentSession.status);
        sessionStatus.dataset.status = currentSession.status || 'in_progress';
        progressText.textContent = nextQuestion
            ? `当前维度：${nextQuestion.section} / ${nextQuestion.label} · 进度 ${nextQuestion.progress}%`
            : '问诊已完成，可以确认画像并继续做岗位匹配。';

        chatMessages.innerHTML = currentSession.messages.map((message) => `
            <div class="chat-message ${message.role === 'assistant' ? 'assistant' : 'user'}">
                <div class="chat-avatar">${message.role === 'assistant' ? 'AI' : user.username.slice(0, 1).toUpperCase()}</div>
                <div class="chat-content">
                    <div class="chat-role">${message.role === 'assistant' ? 'AI 助手' : '你'}</div>
                    <div class="chat-bubble">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
                </div>
            </div>
        `).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;

        renderProfileForm(currentSession.profile || {});
        renderAnswerPanel();
        renderSummary();
        renderJobMatches();
    }

    function renderAnswerPanel() {
        const canAnswer = currentSession.status === 'in_progress' && nextQuestion;
        answerPanel.classList.toggle('hidden', !canAnswer);
        if (!canAnswer) {
            return;
        }

        answerLabel.textContent = `${nextQuestion.section} / ${nextQuestion.label}`;
        answerInput.placeholder = nextQuestion.placeholder || '请输入你的回答';
        answerTip.textContent = nextQuestion.tip || '';

        if (nextQuestion.mode === 'follow_up') {
            questionModeBadge.textContent = '补充追问';
            questionModeBadge.className = 'question-mode-badge follow-up';
        } else {
            questionModeBadge.textContent = '当前维度';
            questionModeBadge.className = 'question-mode-badge';
        }

        renderSuggestionChips(nextQuestion.suggestions || []);
        resizeTextarea();
    }

    function renderSummary() {
        if (currentSession.summary) {
            sessionSummary.textContent = currentSession.summary;
            sessionSummary.className = 'summary-box';
        } else {
            sessionSummary.className = 'summary-box hidden';
        }

        const canConfirm = currentSession.current_step >= profileFields.length;
        confirmProfileBtn.disabled = !canConfirm || currentSession.status === 'confirmed';
        confirmHint.textContent = canConfirm
            ? '确认后，后续岗位匹配和简历优化都会基于这份画像。'
            : '请通过“下一步”走完全部维度，再确认画像。';
    }

    function renderSuggestionChips(suggestions) {
        if (!suggestions.length) {
            answerSuggestions.innerHTML = '';
            answerSuggestions.classList.add('hidden');
            return;
        }

        answerSuggestions.innerHTML = suggestions.map((item) => `
            <button type="button" class="suggestion-chip">${escapeHtml(item)}</button>
        `).join('');
        answerSuggestions.classList.remove('hidden');

        answerSuggestions.querySelectorAll('.suggestion-chip').forEach((button) => {
            button.addEventListener('click', () => {
                answerInput.value = button.textContent;
                answerInput.focus();
                resizeTextarea();
            });
        });
    }

    function renderProfileForm(profile) {
        profileForm.innerHTML = profileFields.map((field) => `
            <div class="form-group compact-form-group">
                <label for="field-${field.key}">${escapeHtml(field.label)}</label>
                <textarea
                    id="field-${field.key}"
                    data-field-key="${field.key}"
                    rows="3"
                    placeholder="${escapeHtml(field.placeholder || '')}"
                >${escapeHtml(profile[field.key] || '')}</textarea>
            </div>
        `).join('');
    }

    function collectProfileFormData() {
        const profile = {};
        profileForm.querySelectorAll('[data-field-key]').forEach((element) => {
            profile[element.dataset.fieldKey] = element.value.trim();
        });
        return profile;
    }

    async function submitAnswer(answer) {
        if (!answer.trim()) {
            showError('请先填写当前问题的回答。');
            return;
        }

        try {
            clearMessages();
            toggleAnswerButtons(true);
            submitAnswerBtn.textContent = '发送中...';

            const response = await api.answerInterviewQuestion(sessionId, answer);
            hydrateSessionState(response);
            answerInput.value = '';
            renderSession();
        } catch (error) {
            showError(error.message);
        } finally {
            toggleAnswerButtons(false);
            submitAnswerBtn.textContent = '发送';
        }
    }

    async function moveToNextStep() {
        try {
            clearMessages();
            toggleAnswerButtons(true);
            nextStepBtn.textContent = '推进中...';

            const response = await api.moveToNextInterviewStep(sessionId);
            hydrateSessionState(response);
            answerInput.value = '';
            renderSession();
            showSuccess('已进入下一个方面。');
        } catch (error) {
            showError(error.message);
        } finally {
            toggleAnswerButtons(false);
            nextStepBtn.textContent = '下一步';
        }
    }

    async function saveProfile(confirm = false) {
        try {
            clearMessages();
            toggleProfileButtons(true);
            const profile = collectProfileFormData();
            const response = await api.updateInterviewProfile(sessionId, profile, confirm);
            hydrateSessionState(response);
            renderSession();
            showSuccess(confirm ? '画像已确认。' : '画像修改已保存。');
        } catch (error) {
            showError(error.message);
        } finally {
            toggleProfileButtons(false);
        }
    }

    async function createJobMatch() {
        const jobTitle = (jobTitleInput.value || '').trim();
        const jdText = (jobDescriptionInput.value || '').trim();

        if (!jobTitle) {
            showError('请先填写目标岗位名称。');
            return;
        }
        if (jdText.length < 20) {
            showError('请粘贴更完整的岗位 JD，至少 20 个字。');
            return;
        }

        try {
            clearMessages();
            analyzeJobMatchBtn.disabled = true;
            analyzeJobMatchBtn.textContent = '分析中...';
            const response = await api.createJobMatch(sessionId, user.id, jobTitle, jdText);
            jobMatches = response.job_matches || [];
            renderJobMatches(response.job_match || null);
            showSuccess('岗位匹配分析已完成。');
        } catch (error) {
            showError(error.message);
        } finally {
            analyzeJobMatchBtn.disabled = false;
            analyzeJobMatchBtn.textContent = '开始岗位匹配';
        }
    }

    function renderJobMatches(latestMatch = null) {
        const activeMatch = latestMatch || jobMatches[0];
        if (activeMatch) {
            jobMatchResult.textContent = buildJobMatchText(activeMatch);
            jobMatchResult.className = 'summary-box';
        } else {
            jobMatchResult.className = 'summary-box hidden';
        }

        if (!jobMatches.length) {
            jobMatchList.innerHTML = '<p class="empty-state">还没有岗位匹配结果。先确认画像，再粘贴一个目标岗位 JD。</p>';
            return;
        }

        jobMatchList.innerHTML = jobMatches.map((match) => `
            <div class="resume-item compact-item">
                <h3>${escapeHtml(match.job_title)}</h3>
                <p><strong>匹配分：</strong>${match.match_score}</p>
                <p class="resume-preview">${escapeHtml(match.summary || '')}</p>
                <div class="resume-actions">
                    <button type="button" class="llm-ghost-btn" data-view-job-match="${match.id}">查看结果</button>
                    <button type="button" class="llm-ghost-btn" data-delete-job-match="${match.id}">删除</button>
                </div>
            </div>
        `).join('');

        jobMatchList.querySelectorAll('[data-view-job-match]').forEach((button) => {
            button.addEventListener('click', () => {
                const targetId = Number(button.dataset.viewJobMatch);
                const targetMatch = jobMatches.find((item) => item.id === targetId);
                if (targetMatch) {
                    jobMatchResult.textContent = buildJobMatchText(targetMatch);
                    jobMatchResult.className = 'summary-box';
                }
            });
        });

        jobMatchList.querySelectorAll('[data-delete-job-match]').forEach((button) => {
            button.addEventListener('click', async () => {
                const targetId = Number(button.dataset.deleteJobMatch);
                const confirmed = window.confirm('确认删除这个岗位匹配结果吗？');
                if (!confirmed) {
                    return;
                }
                try {
                    await api.deleteJobMatch(targetId, user.id);
                    jobMatches = jobMatches.filter((item) => item.id !== targetId);
                    renderJobMatches(jobMatches[0] || null);
                    showSuccess('岗位匹配结果已删除。');
                } catch (error) {
                    showError(error.message);
                }
            });
        });
    }

    function buildJobMatchText(match) {
        const sections = [
            `岗位：${match.job_title}`,
            `匹配分：${match.match_score}`,
            '',
            `总结：${match.summary || '暂无总结'}`
        ];

        if (match.keywords && match.keywords.length) {
            sections.push('', `关键词：${match.keywords.join('、')}`);
        }
        if (match.strengths && match.strengths.length) {
            sections.push('', '优势：');
            match.strengths.forEach((item, index) => sections.push(`${index + 1}. ${item}`));
        }
        if (match.gaps && match.gaps.length) {
            sections.push('', '短板：');
            match.gaps.forEach((item, index) => sections.push(`${index + 1}. ${item}`));
        }
        if (match.suggestions && match.suggestions.length) {
            sections.push('', '建议：');
            match.suggestions.forEach((item, index) => sections.push(`${index + 1}. ${item}`));
        }
        return sections.join('\n');
    }

    function resizeTextarea() {
        answerInput.style.height = 'auto';
        answerInput.style.height = Math.min(answerInput.scrollHeight, 220) + 'px';
    }

    answerInput.addEventListener('input', resizeTextarea);
    answerInput.addEventListener('keydown', async (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            await submitAnswer(answerInput.value);
        }
    });

    submitAnswerBtn.addEventListener('click', async () => {
        await submitAnswer(answerInput.value);
    });

    skipAnswerBtn.addEventListener('click', async () => {
        await submitAnswer('这部分我先跳过，后面再补充。');
    });

    nextStepBtn.addEventListener('click', async () => {
        await moveToNextStep();
    });

    saveProfileBtn.addEventListener('click', async () => {
        await saveProfile(false);
    });

    confirmProfileBtn.addEventListener('click', async () => {
        await saveProfile(true);
    });

    analyzeJobMatchBtn.addEventListener('click', async () => {
        await createJobMatch();
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            userManager.clearUser();
            window.location.href = '/login.html';
        });
    }

    await ensureSession();
    await loadSession();
});

function translateStatus(status) {
    if (status === 'completed') {
        return '待确认';
    }
    if (status === 'confirmed') {
        return '已确认';
    }
    return '进行中';
}

function toggleAnswerButtons(disabled) {
    document.getElementById('submitAnswerBtn').disabled = disabled;
    document.getElementById('skipAnswerBtn').disabled = disabled;
    document.getElementById('nextStepBtn').disabled = disabled;
}

function toggleProfileButtons(disabled) {
    document.getElementById('saveProfileBtn').disabled = disabled;
    document.getElementById('confirmProfileBtn').disabled = disabled;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    successDiv.className = 'hidden';
    errorDiv.textContent = message;
    errorDiv.className = 'error-message';
}

function showSuccess(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    errorDiv.className = 'hidden';
    successDiv.textContent = message;
    successDiv.className = 'success-message';
}

function clearMessages() {
    document.getElementById('errorMessage').className = 'hidden';
    document.getElementById('successMessage').className = 'hidden';
}

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
