import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function PrivacyNotice() {
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef(null);

  // Only show on homepage 
  const allowedPaths = ['/'];
  const isAllowedPath = allowedPaths.includes(location.pathname);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 10) {
        setScrolledToBottom(true);
      }
    };

    scrollEl.addEventListener("scroll", handleScroll);
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [isAllowedPath]);

  const agree = () => setOpen(false);

  if (!open || !isAllowedPath) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Data Privacy Notice"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-2xl md:text-4xl font-bold tracking-wide bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
            GENERAL PRIVACY NOTICE
          </h2>
        </div>


        {/* Content */}
        <div ref={scrollRef} className="p-6 overflow-y-auto flex-1 space-y-3 text-slate-700">
          <p>
            Upon using this device, you acknowledge and agree that we may collect and process your personal and
            vital signs data in accordance with the{" "}
            <strong>Data Privacy Act of 2012 (RA 10173)</strong>. The information collected will be used only for
            legitimate medical purposes, particularly for pre-checkup assessments and patient record management.
            Your data will be handled fairly, lawfully, and securely, with only the minimum necessary information
            gathered.
          </p>

          <p>
            Please read our{" "}
            <Link to="/privacy" className="underline hover:opacity-80">
              Privacy Policy
            </Link>{" "}
             and{" "}  
            <Link to="/terms" className="underline hover:opacity-80">
             Terms of Service
            </Link>{" "}
            below to understand how we collect, use, store, and protect your data. By proceeding, you consent to the
            practices outlined in these documents.
          </p>

          <h1 className="text-4xl md:text-4xl font-bold tracking-wide bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
        PRIVACY POLICY
      </h1>

      <p className="text-slate-700 mt-6 mb-4 leading-loose">
        Esperanza Health Center (EHC) operates the kiosk-based Patient Registration and Pre-Checkup System,
        a system designed to facilitate the efficient registration and preliminary medical assessment of patients.
        This Privacy Policy explains how EHC collects, uses, stores, and protects personal and health-related
        information processed through the system. EHC is committed to ensuring the confidentiality,
        integrity, and availability of all data in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173),
        its Implementing Rules and Regulations, and other applicable laws of the Republic of the Philippines.
      </p>


      <h2 className="text-xl font-semibold mt-6 mb-2">1. Information Collected</h2>
      <p className="text-slate-700 mb-3 leading-loose">
        The system collects and processes the following categories of information:
      </p>
      <ul className="list-disc pl-8 text-slate-700 mb-3 leading-relaxed space-y-2">
        <li>
          <strong>Personal Information:</strong> Full name, date of birth, gender, home address,
          contact number, and username.
        </li>
        <li>
          <strong>Biometric Information:</strong> Fingerprint data used for patient verification and authentication.
        </li>
        <li>
          <strong>Health Information:</strong> Basic vital signs such as temperature, pulse rate, and blood pressure.
        </li>
        <li>
          <strong>System-Generated Data:</strong> Unique patient identification numbers, timestamps, and audit logs associated with user activity.
        </li>
      </ul>
      <p className="text-slate-700 mb-3 leading-loose">
        The system does <strong>NOT</strong> collect cookies, browsing data, or analytics from external services.
      </p>


      <h2 className="text-xl font-semibold mt-6 mb-2">2. Purpose of Data Collection</h2>
      <p className="text-slate-700 mb-3 leading-loose">
        All personal, biometric, and health-related information collected by EHC shall be used solely for legitimate healthcare and administrative purposes, including but not limited to:
      </p>
      <ol className="list-decimal pl-8 text-slate-700 mb-3 leading-relaxed space-y-2">
        <li>Establishing and maintaining patient records for medical consultation.</li>
        <li>Verifying patient identity through biometric enrollment.</li>
        <li>Streamlining pre-checkup procedures and queue management.</li>
        <li>Facilitating accurate and efficient service delivery by healthcare staff.</li>
        <li>Complying with legal and regulatory obligations applicable to health institutions.</li>
      </ol>


      
      <h2 className="text-xl font-semibold mt-6 mb-2">3. Purpose of Processing</h2>
      <ol className="list-decimal pl-8 text-slate-700 space-y-2 leading-relaxed">
        <li>Establish and maintain patient records for medical consultation;</li>
        <li>Verify patient identity through biometric enrollment;</li>
        <li>Streamline pre-checkup procedures and queue management;</li>
        <li>Facilitate accurate and efficient service delivery by healthcare staff; and</li>
        <li>Comply with legal and regulatory obligations applicable to health institutions.</li>
      </ol>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">4. Data Retention and Storage</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        All data collected through the Application are securely stored within EHC’s local database systems.
        Access to these records is restricted to authorized healthcare and administrative personnel only.
      </p>
      <p className="text-slate-700 mb-3 leading-relaxed">
        Personal and health information shall be retained only for as long as necessary to achieve its intended
        purpose or as required by law. Upon expiration of the retention period, data shall be securely deleted or
        anonymized in accordance with EHC’s data retention policy.
      </p>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">5. Data Sharing and Disclosure</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        EHC does not sell, rent, or share personal data with external parties. Disclosure of personal or health
        information shall only occur under the following conditions:
      </p>
      <ul className="list-disc pl-8 text-slate-700 space-y-2 leading-relaxed">
        <li>When required by law, regulation, or court order;</li>
        <li>When necessary for legitimate internal operations and audits; and</li>
        <li>When authorized personnel require access to perform their official duties.</li>
      </ul>
      <p className="text-slate-700 mt-3 leading-relaxed">
        All disclosures are governed by strict confidentiality and data protection protocols.
      </p>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">6. Security Measures</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        EHC implements appropriate organizational, physical, and technical safeguards to protect personal and health
        data against unauthorized access, alteration, disclosure, or destruction. These measures include:
      </p>
      <ul className="list-disc pl-8 text-slate-700 space-y-2 leading-relaxed">
        <li>Encrypted biometric and health data storage;</li>
        <li>Secure authentication and access control mechanisms;</li>
        <li>Regular security audits and system maintenance; and</li>
        <li>Controlled data access limited to authorized staff members.</li>
      </ul>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">7. Rights of Data Subjects</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        Consistent with the Data Privacy Act of 2012, all data subjects whose information is processed through the
        system are entitled to the following rights:
      </p>
      <ol className="list-decimal pl-8 text-slate-700 space-y-2 leading-relaxed">
        <li><strong>Right to be informed</strong> – to know how and why their data are collected and processed;</li>
        <li><strong>Right to access</strong> – to obtain a copy of personal data upon written request;</li>
        <li><strong>Right to rectification</strong> – to correct inaccurate or outdated information;</li>
        <li><strong>Right to erasure or blocking</strong> – to request deletion of data under lawful grounds;</li>
        <li><strong>Right to object or withdraw consent</strong> – to restrict or discontinue data processing; and</li>
        <li><strong>Right to lodge a complaint</strong> – to file a grievance before the National Privacy Commission (NPC).</li>
      </ol>
      <p className="text-slate-700 mt-3 leading-relaxed">
        Requests may be submitted in writing to the Data Protection Officer (DPO) of EHC through the following contact details:
        <br />
        <em>esperanzahc@gmail.com or [Insert DPO Email]</em>
        <br />
        Esperanza Health Center, <em>286 Teresa Street, Old Sta. Mesa, Manila</em>
      </p>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">8. Consent</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        By registering or logging into the system, users acknowledge that they have read, understood, and voluntarily
        consent to the lawful processing of their personal and health information for the purposes described in this Policy.
      </p>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">9. Policy Amendments</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        EHC reserves the right to amend or update this Privacy Policy at any time to reflect legal, operational, or
        technological changes. Any revisions shall take effect upon posting within the system and shall bear the
        updated effective date.
      </p>

      
      <h2 className="text-xl font-semibold mt-6 mb-2">10. Effective Date and Contact</h2>
      <p className="text-slate-700 mb-3 leading-relaxed">
        This Policy is effective as of the date below. For clarifications, you may contact the EHC Data Protection Officer.
      </p>



      {/*TERMS OF SERVICE*/}
      <h1 className="text-4xl md:text-4xl font-bold tracking-wide bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
              TERMS OF SERVICE
            </h1>
      
           
            <h2 className="text-xl font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              By accessing and using the Esperanza Health Center (EHC) Kiosk System, all users agree to
              comply with these Terms of Service. Access or use of the System signifies acknowledgement and acceptance
              of these terms. Users who do not agree are advised to discontinue use immediately.
            </p>
      
         
            <h2 className="text-xl font-semibold mt-6 mb-2">2. Description of Service</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              The System serves as a patient registration and pre-checkup platform designed to facilitate data
              collection, vital signs collection, biometric authentication, and record management within EHC. It
              enables patients to create accounts and input personal and health information, and allows authorized
              healthcare personnel to review and manage such records.
            </p>
      
      
            <h2 className="text-xl font-semibold mt-6 mb-2">3. User Eligibility</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              The System is intended for patients and healthcare personnel of EHC aged ten (10) years and above. Use by
              minors must be supervised by a parent or guardian and is subject to applicable consent requirements.
            </p>
      
      
            <h2 className="text-xl font-semibold mt-6 mb-2">4. User Responsibilities</h2>
            <ul className="list-disc pl-8 text-slate-700 mb-3 leading-relaxed space-y-2">
              <li>Patients shall provide accurate and truthful information when creating an account or submitting data.</li>
              <li>Patients are responsible for maintaining the confidentiality of their login credentials.</li>
              <li>Healthcare staff are expected to handle patient data with due professional care and confidentiality.</li>
              <li>
                Any unauthorized access, modification, or misuse of information is strictly prohibited and may lead to
                administrative or legal sanctions.
              </li>
            </ul>
      
          
            <h2 className="text-xl font-semibold mt-6 mb-2">5. Permitted and Prohibited Activities</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              The System shall only be used for legitimate healthcare and administrative purposes related to EHC’s
              operations. Patients are prohibited from:
            </p>
            <ul className="list-disc pl-8 text-slate-700 mb-3 leading-relaxed space-y-2">
              <li>Submitting false, misleading, or fraudulent information;</li>
              <li>Attempting to gain unauthorized access to any portion of the System;</li>
              <li>Tampering with the data;</li>
              <li>Interfering with the integrity or performance of the System;</li>
              <li>Using the System for any activity that violates existing laws or EHC policies.</li>
            </ul>
      
       
            <h2 className="text-xl font-semibold mt-6 mb-2">6. Data Privacy and Protection</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              All data collected and processed through the System are governed by EHC’s{" "}
              <Link to="/privacy" className="underline hover:opacity-80">
                Privacy Policy
              </Link>{" "}
              and the Data Privacy Act of 2012 (RA 10173). By using the System, patients and healthcare staff consent to
              the lawful collection and processing of their information as outlined in said policy.
            </p>
      
        
            <h2 className="text-xl font-semibold mt-6 mb-2">7. Intellectual Property Rights</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              All components, designs, trademarks, databases, and documentation within the System are the
              exclusive property of Esperanza Health Center. Unauthorized reproduction, modification, or distribution of
              any part of the System is strictly prohibited without prior written consent from EHC.
            </p>
      
      
            <h2 className="text-xl font-semibold mt-6 mb-2">8. Limitation of Liability</h2>
            <p className="text-slate-700 mb-3 leading-loose">EHC shall not be held liable for any direct, indirect, or consequential damages resulting from:</p>
            <ul className="list-disc pl-8 text-slate-700 mb-3 leading-relaxed space-y-2">
              <li>Errors or omissions in user-provided data;</li>
              <li>Unauthorized access caused by user negligence;</li>
              <li>Temporary unavailability or malfunction of the System;</li>
              <li>Events beyond EHC’s reasonable control, such as technical failures or force majeure incidents.</li>
            </ul>
      
      
            <h2 className="text-xl font-semibold mt-6 mb-2">9. Amendments to the Terms</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              EHC reserves the right to revise or update these Terms of Service at any time without prior notice. Users
              are encouraged to review the Terms periodically. Continued use of the System following the publication of
              revisions constitutes acceptance of the updated Terms.
            </p>
      
            
            <h2 className="text-xl font-semibold mt-6 mb-2">10. Contact Information</h2>
            <p className="text-slate-700 mb-3 leading-loose">
              For questions, feedback, or concerns related to these Terms, patients may contact:
              <br />
              <span className="inline-block">
                <em>esperanzahc@gmail.com</em> or <em>DPO Email</em>
              </span>
              <br />
              <span className="inline-block">
                Esperanza Health Center, <em>286 Teresa Street, Old Sta. Mesa, Manila</em>
              </span>
            </p>

        {/* MAY BE UPDATED TO THE LATEST DATE PRIVACY POLICY IS REVISED */}
        <p className="text-sm text-slate-500 mt-6">Last updated: October 2025</p>
        </div>

        {/* Footer */}
        {scrolledToBottom ? (
      <div className="p-4 border-t bg-white flex flex-col gap-4 items-center">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            I accept the{" "}
            <Link to="/terms" className="underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>.
          </span>
        </label>

        <button
          onClick={agree}
          disabled={!checked}
          className="bg-[#6ec1af] hover:bg-emerald-800/70 text-white px-6 py-2 rounded-lg disabled:opacity-50"
        >
          I AGREE
        </button>
      </div>
    ) : (
      <div className="p-4 border-t border-slate-200 bg-white text-center text-sm text-slate-600">
        Scroll down to read the entire notice to continue.
      </div>
    )}
      </div>
    </div>  
  );
}