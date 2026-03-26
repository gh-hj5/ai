document.addEventListener('DOMContentLoaded', async function() {
    const user = userManager.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.textContent = `欢迎，${user.username}`;
    }

    const resumeList = document.getElementById('resumeList');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('errorMessage');
    const uploadErrorDiv = document.getElementById('uploadErrorMessage');
    const uploadSuccessDiv = document.getElementById('uploadSuccessMessage');
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const interviewList = document.getElementById('interviewList');
    const interviewLoading = document.getElementById('interviewLoading');
    const interviewErrorDiv = document.getElementById('interviewErrorMessage');
    const newInterviewBtn = document.getElementById('newInterviewBtn');
    const testLlmBtn = document.getElementById('testLlmBtn');
    const llmEnabledText = document.getElementById('llmEnabledText');
    const llmProviderText = document.getElementById('llmProviderText');
    const llmModelText = document.getElementById('llmModelText');
    const llmErrorDiv = document.getElementById('llmErrorMessage');
    const llmSuccessDiv = document.getElementById('llmSuccessMessage');
    const llmReplyBox = document.getElementById('llmReplyBox');
    const profileMessage = document.getElementById('profileMessage');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    const profileInputs = {
        full_name: document.getElementById('fullNameInput'),
        school: document.getElementById('schoolInput'),
        degree: document.getElementById('degreeInput'),
        major: document.getElementById('majorInput'),
        graduation_year: document.getElementById('graduationYearInput'),
        target_city: document.getElementById('targetCityInput'),
        target_industry: document.getElementById('targetIndustryInput'),
        bio: document.getElementById('bioInput'),
    };

    async function loadProfile() {
        try {
            const response = await api.getUserProfile(user.id);
            const profile = response.user || {};
            Object.entries(profileInputs).forEach(([key, input]) => {
                input.value = profile[key] || '';
            });
        } catch (error) {
            profileMessage.textContent = error.message;
            profileMessage.className = 'error-message';
        }
    }

    async function saveProfile() {
        try {
            profileMessage.className = 'hidden';
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = '保存中...';
            const payload = {};
            Object.entries(profileInputs).forEach(([key, input]) => {
                payload[key] = input.value.trim();
            });
            const response = await api.updateUserProfile(user.id, payload);
            userManager.setUser(response.user);
            userInfo.textContent = `欢迎，${response.user.username}`;
            profileMessage.textContent = '个人资料已更新';
            profileMessage.className = 'success-message';
        } catch (error) {
            profileMessage.textContent = error.message;
            profileMessage.className = 'error-message';
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.textContent = '保存资料';
        }
    }

    async function loadLlmStatus() {
        try {
            const status = await api.getLlmStatus();
            llmEnabledText.textContent = status.enabled ? '已启用' : '未启用';
            llmProviderText.textContent = status.provider || '-';
            llmModelText.textContent = status.model || '-';
        } catch (error) {
            llmEnabledText.textContent = '获取失败';
            llmErrorDiv.textContent = error.message;
            llmErrorDiv.className = 'error-message';
        }
    }

    async function testLlmConnection() {
        llmErrorDiv.className = 'hidden';
        llmSuccessDiv.className = 'hidden';
        llmReplyBox.className = 'summary-box hidden';
        testLlmBtn.disabled = true;
        testLlmBtn.textContent = '测试中...';

        try {
            const result = await api.testLlmConnection();
            llmEnabledText.textContent = result.enabled ? '已启用' : '未启用';
            llmProviderText.textContent = result.provider || '-';
            llmModelText.textContent = result.model || '-';
            llmSuccessDiv.textContent = result.message;
            llmSuccessDiv.className = 'success-message';
            llmReplyBox.textContent = `模型回复：${result.reply}`;
            llmReplyBox.className = 'summary-box';
        } catch (error) {
            llmErrorDiv.textContent = error.message;
            llmErrorDiv.className = 'error-message';
        } finally {
            testLlmBtn.disabled = false;
            testLlmBtn.textContent = '测试大模型连接';
        }
    }

    async function loadResumes() {
        try {
            loadingDiv.className = 'loading';
            errorDiv.className = 'hidden';
            const response = await api.getUserResumes(user.id);
            displayResumes(response.resumes || []);
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.className = 'error-message';
        } finally {
            loadingDiv.className = 'hidden';
        }
    }

    function displayResumes(resumes) {
        if (!resumes.length) {
            resumeList.innerHTML = '<p class="empty-state">还没有上传简历，先上传一份 PDF 简历吧。</p>';
            return;
        }

        resumeList.innerHTML = resumes.map((resume) => `
            <div class="resume-item">
                <h3>${escapeHtml(resume.filename)}</h3>
                <p><strong>上传时间：</strong>${new Date(resume.created_at).toLocaleString('zh-CN')}</p>
                ${resume.content_text ? `<p class="resume-preview">${escapeHtml(resume.content_text.substring(0, 220))}...</p>` : ''}
                <div class="resume-actions">
                    <a href="/resume.html?id=${resume.id}" class="btn btn-primary">查看详情</a>
                    <button class="btn btn-danger" data-delete-resume="${resume.id}" data-resume-name="${escapeHtml(resume.filename)}">删除</button>
                </div>
            </div>
        `).join('');

        resumeList.querySelectorAll('[data-delete-resume]').forEach((button) => {
            button.addEventListener('click', async () => {
                const resumeId = Number(button.dataset.deleteResume);
                const resumeName = button.dataset.resumeName;
                const confirmed = window.confirm(`确认删除简历“${resumeName}”吗？这会同时删除分析结果和优化版本。`);
                if (!confirmed) {
                    return;
                }

                button.disabled = true;
                button.textContent = '删除中...';
                try {
                    await api.deleteResume(resumeId, user.id);
                    await loadResumes();
                } catch (error) {
                    errorDiv.textContent = error.message;
                    errorDiv.className = 'error-message';
                }
            });
        });
    }

    async function loadInterviewSessions() {
        try {
            interviewLoading.className = 'loading';
            interviewErrorDiv.className = 'hidden';
            const response = await api.getInterviewSessions(user.id);
            displayInterviewSessions(response.sessions || []);
        } catch (error) {
            interviewErrorDiv.textContent = error.message;
            interviewErrorDiv.className = 'error-message';
        } finally {
            interviewLoading.className = 'hidden';
        }
    }

    function displayInterviewSessions(sessions) {
        if (!sessions.length) {
            interviewList.innerHTML = '<p class="empty-state">还没有问诊任务。建议先做一次问诊，把求职方向和经历亮点梳理清楚。</p>';
            return;
        }

        interviewList.innerHTML = sessions.map((session) => `
            <div class="resume-item">
                <h3>${escapeHtml(session.title)}</h3>
                <p><strong>状态：</strong>${translateInterviewStatus(session.status)}</p>
                <p><strong>最近更新时间：</strong>${new Date(session.updated_at).toLocaleString('zh-CN')}</p>
                <p class="resume-preview">${session.summary ? escapeHtml(session.summary.substring(0, 140)) + '...' : '已开始问诊，可继续补充求职画像。'}</p>
                <div class="resume-actions">
                    <a href="/interview.html?session=${session.id}" class="btn btn-primary">${session.status === 'in_progress' ? '继续问诊' : '查看结果'}</a>
                    <button class="btn btn-danger" data-delete-session="${session.id}" data-session-name="${escapeHtml(session.title)}">删除</button>
                </div>
            </div>
        `).join('');

        interviewList.querySelectorAll('[data-delete-session]').forEach((button) => {
            button.addEventListener('click', async () => {
                const sessionId = Number(button.dataset.deleteSession);
                const sessionName = button.dataset.sessionName;
                const confirmed = window.confirm(`确认删除问诊任务“${sessionName}”吗？删除后聊天记录和画像都会丢失。`);
                if (!confirmed) {
                    return;
                }

                button.disabled = true;
                button.textContent = '删除中...';
                try {
                    await api.deleteInterviewSession(sessionId, user.id);
                    await loadInterviewSessions();
                } catch (error) {
                    interviewErrorDiv.textContent = error.message;
                    interviewErrorDiv.className = 'error-message';
                }
            });
        });
    }

    async function handleFileUpload(file) {
        const fileName = (file.name || '').toLowerCase();
        const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx');

        if (!isPdf && !isDocx) {
            uploadErrorDiv.textContent = '只支持 PDF 或 DOCX 格式文件';
            uploadErrorDiv.className = 'error-message';
            return;
        }

        if (file.size > 16 * 1024 * 1024) {
            uploadErrorDiv.textContent = '文件大小不能超过 16MB';
            uploadErrorDiv.className = 'error-message';
            return;
        }

        uploadErrorDiv.className = 'hidden';
        uploadSuccessDiv.className = 'hidden';
        const uploadingDiv = document.getElementById('uploading');
        uploadingDiv.className = 'loading';
        uploadingDiv.textContent = '上传中...';

        try {
            await api.uploadResume(file, user.id);
            uploadSuccessDiv.textContent = '简历上传成功';
            uploadSuccessDiv.className = 'success-message';
            setTimeout(() => {
                uploadSuccessDiv.className = 'hidden';
                loadResumes();
            }, 1200);
        } catch (error) {
            uploadErrorDiv.textContent = error.message;
            uploadErrorDiv.className = 'error-message';
        } finally {
            uploadingDiv.className = 'hidden';
            fileInput.value = '';
        }
    }

    testLlmBtn.addEventListener('click', async () => {
        await testLlmConnection();
    });

    saveProfileBtn.addEventListener('click', async () => {
        await saveProfile();
    });

    newInterviewBtn.addEventListener('click', async () => {
        newInterviewBtn.disabled = true;
        newInterviewBtn.textContent = '创建中...';
        interviewErrorDiv.className = 'hidden';

        try {
            const response = await api.createInterviewSession(user.id);
            window.location.href = `/interview.html?session=${response.session.id}`;
        } catch (error) {
            interviewErrorDiv.textContent = error.message;
            interviewErrorDiv.className = 'error-message';
        } finally {
            newInterviewBtn.disabled = false;
            newInterviewBtn.textContent = '开始新问诊';
        }
    });

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', (event) => {
        event.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = event.dataTransfer.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            userManager.clearUser();
            window.location.href = '/login.html';
        });
    }

    await Promise.all([loadProfile(), loadLlmStatus(), loadResumes(), loadInterviewSessions()]);
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function translateInterviewStatus(status) {
    if (status === 'confirmed') {
        return '已确认';
    }
    if (status === 'completed') {
        return '待确认';
    }
    return '进行中';
}
