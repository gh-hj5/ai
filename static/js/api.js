const API_BASE_URL = '/api';

const api = {
    async register(username, email, password) {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '注册失败');
        }
        return data;
    },

    async login(username, password) {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '登录失败');
        }
        return data;
    },

    async getUserProfile(userId) {
        const response = await fetch(`${API_BASE_URL}/profile/${userId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取用户资料失败');
        }
        return data;
    },

    async updateUserProfile(userId, profile) {
        const response = await fetch(`${API_BASE_URL}/profile/${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(profile),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '更新用户资料失败');
        }
        return data;
    },

    async uploadResume(file, userId) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);

        const response = await fetch(`${API_BASE_URL}/upload-resume`, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '上传失败');
        }
        return data;
    },

    async getUserResumes(userId) {
        const response = await fetch(`${API_BASE_URL}/resumes/${userId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取简历列表失败');
        }
        return data;
    },

    async analyzeResume(resumeId) {
        const response = await fetch(`${API_BASE_URL}/analyze-resume/${resumeId}`, {
            method: 'POST',
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '分析失败');
        }
        return data;
    },

    async generateQuestions(resumeId, numQuestions = 10) {
        const response = await fetch(`${API_BASE_URL}/generate-questions/${resumeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ num_questions: numQuestions }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '生成题目失败');
        }
        return data;
    },

    async getQuestions(resumeId) {
        const response = await fetch(`${API_BASE_URL}/questions/${resumeId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取题目失败');
        }
        return data;
    },

    async deleteResume(resumeId, userId) {
        const response = await fetch(`${API_BASE_URL}/resume/${resumeId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '删除简历失败');
        }
        return data;
    },

    async createInterviewSession(userId, title = '问诊式求职分析') {
        const response = await fetch(`${API_BASE_URL}/interviews`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId, title }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '创建问诊任务失败');
        }
        return data;
    },

    async getInterviewSessions(userId) {
        const response = await fetch(`${API_BASE_URL}/interviews/${userId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取问诊任务失败');
        }
        return data;
    },

    async getInterviewSession(sessionId) {
        const response = await fetch(`${API_BASE_URL}/interview-session/${sessionId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取问诊详情失败');
        }
        return data;
    },

    async answerInterviewQuestion(sessionId, answer) {
        const response = await fetch(`${API_BASE_URL}/interview-session/${sessionId}/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ answer }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '提交回答失败');
        }
        return data;
    },

    async moveToNextInterviewStep(sessionId) {
        const response = await fetch(`${API_BASE_URL}/interview-session/${sessionId}/next-step`, {
            method: 'POST',
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '推进到下一步失败');
        }
        return data;
    },

    async deleteInterviewSession(sessionId, userId) {
        const response = await fetch(`${API_BASE_URL}/interview-session/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '删除问诊任务失败');
        }
        return data;
    },

    async updateInterviewProfile(sessionId, profile, confirm = false) {
        const response = await fetch(`${API_BASE_URL}/interview-session/${sessionId}/profile`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ profile, confirm }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '更新画像失败');
        }
        return data;
    },

    async createJobMatch(sessionId, userId, jobTitle, jdText) {
        const response = await fetch(`${API_BASE_URL}/interview-session/${sessionId}/job-matches`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                job_title: jobTitle,
                jd_text: jdText,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '岗位匹配分析失败');
        }
        return data;
    },

    async deleteJobMatch(jobMatchId, userId) {
        const response = await fetch(`${API_BASE_URL}/job-matches/${jobMatchId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '删除岗位匹配结果失败');
        }
        return data;
    },

    async getResumeOptimizations(resumeId, userId) {
        const response = await fetch(`${API_BASE_URL}/resume/${resumeId}/optimizations?user_id=${encodeURIComponent(userId)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取优化版本失败');
        }
        return data;
    },

    async createResumeOptimization(resumeId, payload) {
        const response = await fetch(`${API_BASE_URL}/resume/${resumeId}/optimizations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '生成优化版本失败');
        }
        return data;
    },

    async updateResumeOptimization(versionId, payload) {
        const response = await fetch(`${API_BASE_URL}/optimizations/${versionId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '更新优化版本失败');
        }
        return data;
    },

    async deleteResumeOptimization(versionId, userId) {
        const response = await fetch(`${API_BASE_URL}/optimizations/${versionId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '删除优化版本失败');
        }
        return data;
    },

    async exportResumeOptimization(versionId, userId, exportFormat = 'txt') {
        const response = await fetch(`${API_BASE_URL}/optimizations/${versionId}/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId, export_format: exportFormat }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '导出优化版本失败');
        }
        return data;
    },

    async getExportRecords(userId) {
        const response = await fetch(`${API_BASE_URL}/exports/${userId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取导出记录失败');
        }
        return data;
    },

    getExportDownloadUrl(recordId, userId) {
        return `${API_BASE_URL}/exports/download/${recordId}?user_id=${encodeURIComponent(userId)}`;
    },

    async getLlmStatus() {
        const response = await fetch(`${API_BASE_URL}/llm-status`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '获取大模型状态失败');
        }
        return data;
    },

    async testLlmConnection() {
        const response = await fetch(`${API_BASE_URL}/llm-test`, {
            method: 'POST',
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '大模型连接测试失败');
        }
        return data;
    },
};

const userManager = {
    getUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    },

    clearUser() {
        localStorage.removeItem('user');
    },

    isLoggedIn() {
        return this.getUser() !== null;
    },
};
